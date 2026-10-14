/**
 * The pluggable transport for live hive sync.
 *
 * The default endpoint is the hosted hive: the Cloudflare Worker in
 * workers/hive, backed by a KV namespace, so every build — the GitHub Pages
 * site included — shares one corpus with no configuration anywhere. Set
 * VITE_HIVE_ENDPOINT (a Cloudflare Worker, a Supabase edge function, a tiny
 * serverless proxy — anything that accepts GET and POST) to run a private
 * store instead, or to "off" to keep every teach on the device it was given
 * on. Either way the same code path runs; only the URL changes.
 *
 * Everything here is built to be unable to break the fly. Sync is strictly
 * optional, so every failure mode — endpoint unset, offline, 500, timeout,
 * garbage response — resolves to "no entries, status explains why". Nothing
 * in this file ever throws, and nothing here is on the boot critical path.
 */
import { mergeCorpora, sanitizeCorpus, type HiveEntry } from "./corpus";

export type SyncStatus = "off" | "idle" | "syncing" | "ok" | "error";

export interface HiveTransport {
  readonly name: string;
  /** everything the store knows that is newer than `since` (ISO date, optional) */
  pull(since?: string): Promise<HiveEntry[]>;
  /**
   * Upload entries to the store. When the server responds with the merged
   * corpus (as the Cloudflare Worker does), returns those entries directly so
   * the caller can skip a redundant follow-up GET.
   */
  push(entries: readonly HiveEntry[]): Promise<HiveEntry[] | void>;
}

export interface HttpTransportOptions {
  /** abort a request that takes longer than this (default 8s) */
  timeoutMs?: number;
  /** extra headers, e.g. an auth bearer */
  headers?: Record<string, string>;
  /** how many entries to send in one POST (default 50) */
  batchSize?: number;
}

/**
 * A minimal REST transport: GET returns a corpus (or an array of entries),
 * POST accepts one. Any JSON shape is fine as long as the entries validate —
 * sanitizeCorpus discards whatever it doesn't recognise.
 */
export function httpTransport(endpoint: string, opts: HttpTransportOptions = {}): HiveTransport {
  const base = endpoint.replace(/\/+$/, "");
  const timeoutMs = opts.timeoutMs ?? 8000;
  const batchSize = opts.batchSize ?? 50;

  const request = async (path: string, init: RequestInit): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${base}${path}`, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    name: base,
    async pull(since?: string): Promise<HiveEntry[]> {
      const query = since ? `?since=${encodeURIComponent(since)}` : "";
      const res = await request(query, { headers: { Accept: "application/json", ...opts.headers } });
      if (!res.ok) throw new Error(`hive pull failed: ${res.status}`);
      return sanitizeCorpus(await res.json());
    },
    async push(entries: readonly HiveEntry[]): Promise<HiveEntry[] | void> {
      let lastEntries: HiveEntry[] | undefined;
      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);
        const res = await request("", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...opts.headers },
          // The corpus carries its contributor as `from: [installId]`. Also
          // naming it `installId` keeps pushes correct against hive workers
          // that key on that field instead of `from`.
          body: JSON.stringify({
            version: 1,
            entries: batch.map((e) => (e.from?.length ? { ...e, installId: e.from[0] } : e)),
          }),
        });
        if (!res.ok) throw new Error(`hive push failed: ${res.status}`);
        try {
          const body: unknown = await res.json();
          if (
            body &&
            typeof body === "object" &&
            Array.isArray((body as { entries?: unknown }).entries)
          ) {
            lastEntries = sanitizeCorpus(body);
          }
        } catch {
          // A POST endpoint that returns an empty or non-JSON 2xx is still valid;
          // exchange() will fall back to calling pull().
        }
      }
      return lastEntries;
    },
  };
}

/**
 * The hosted hive: the Cloudflare Worker in workers/hive (KV-backed, rate
 * limited, CORS-open), deployed at this URL. It is the default so every build
 * shares one corpus out of the box — GitHub Pages visitors sync with each
 * other with no configuration anywhere.
 */
export const DEFAULT_HIVE_ENDPOINT = "https://fly-physics-c-hive.shenronrs3.workers.dev";

/**
 * The configured endpoint: VITE_HIVE_ENDPOINT when the build sets one,
 * "off"/"none" for a local-only hive (null), and the hosted hive otherwise.
 */
export function configuredEndpoint(): string | null {
  let value = "";
  try {
    const raw = import.meta.env?.VITE_HIVE_ENDPOINT;
    value = typeof raw === "string" ? raw.trim() : "";
  } catch {
    // no build-time env at all — still the hosted hive
  }
  if (!value) return DEFAULT_HIVE_ENDPOINT;
  const lower = value.toLowerCase();
  return lower === "off" || lower === "none" ? null : value;
}

export interface SyncState {
  status: SyncStatus;
  message: string;
  /** when the last successful exchange happened (ISO) */
  lastSyncedAt: string | null;
  /** entries this device has pushed */
  pushed: number;
  /** entries received from others */
  received: number;
}

export interface HiveSyncOptions {
  transport: HiveTransport | null;
  onChange?: (state: SyncState) => void;
  now?: () => Date;
}

/**
 * Merge-and-sync orchestration. Note the order in `exchange`: local entries go
 * out FIRST, then the pull is merged on top. That way a visitor's own teach is
 * never lost to a race with the store, and the next pull is a no-op for it.
 *
 * Concurrent calls to `exchange` are coalesced and serialized so rapid teach
 * clicks + manual "Sync now" clicks never race on the wire, and entries that
 * the server has already acknowledged for this contributor are not re-uploaded
 * on every subsequent sync.
 */
export class HiveSync {
  private state: SyncState;
  private inflight: Promise<HiveEntry[]> | null = null;
  /** Signatures (`text\0topic\0verdict\0from`) already acknowledged by the remote hive. */
  private syncedSignatures = new Set<string>();

  constructor(private opts: HiveSyncOptions) {
    this.state = {
      status: opts.transport ? "idle" : "off",
      message: opts.transport ? "Not synced yet." : "No hive endpoint configured. Teaches stay on this device.",
      lastSyncedAt: null,
      pushed: 0,
      received: 0,
    };
  }

  get transport(): HiveTransport | null {
    return this.opts.transport;
  }

  getState(): SyncState {
    return this.state;
  }

  private patch(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch };
    this.opts.onChange?.(this.state);
  }

  /** Exchange with the hive. Returns the merged corpus; never throws. */
  async exchange(local: readonly HiveEntry[], since?: string): Promise<HiveEntry[]> {
    const t = this.opts.transport;
    if (!t) return [...local];

    if (this.inflight) {
      // Wait for the in-flight exchange to finish, then run with the latest local state.
      const prev = await this.inflight;
      return this.runExchange(t, mergeCorpora(prev, local), since);
    }

    const p = this.runExchange(t, local, since);
    this.inflight = p;
    try {
      return await p;
    } finally {
      if (this.inflight === p) this.inflight = null;
    }
  }

  private async runExchange(
    t: HiveTransport,
    local: readonly HiveEntry[],
    since?: string,
  ): Promise<HiveEntry[]> {
    this.patch({ status: "syncing", message: `Syncing with ${t.name}…` });
    try {
      const unsynced = local.filter((e) => !this.syncedSignatures.has(entrySyncSig(e)));
      let remoteFromPush: HiveEntry[] | void = undefined;
      if (unsynced.length) {
        remoteFromPush = await t.push(unsynced);
        for (const e of unsynced) this.syncedSignatures.add(entrySyncSig(e));
        this.patch({ pushed: this.state.pushed + unsynced.length });
      }
      const remote = Array.isArray(remoteFromPush)
        ? remoteFromPush
        : await t.pull(since ?? this.state.lastSyncedAt ?? undefined);
      for (const e of remote) this.syncedSignatures.add(entrySyncSig(e));
      const merged = mergeCorpora(local, remote);
      for (const e of merged) {
        if (remote.some((r) => r.text === e.text && r.topic === e.topic && r.verdict === e.verdict)) {
          this.syncedSignatures.add(entrySyncSig(e));
        }
      }
      this.patch({
        status: "ok",
        message: remote.length
          ? `Synced: ${remote.length} shared ${remote.length === 1 ? "teach" : "teaches"} in the hive.`
          : "Synced, already up to date.",
        lastSyncedAt: (this.opts.now?.() ?? new Date()).toISOString(),
        received: this.state.received + remote.length,
      });
      return merged;
    } catch (err) {
      this.patch({
        status: "error",
        message: `Hive unreachable (${describeSyncError(err)}), but it keeps working offline.`,
      });
      return [...local];
    }
  }
}

function entrySyncSig(e: HiveEntry): string {
  const contrib = e.from?.length ? [...e.from].sort().join(",") : "";
  return `${e.text}\0${e.topic}\0${e.verdict}\0${contrib}`;
}

function describeSyncError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "AbortError") return "timed out";
    return err.message.slice(0, 80);
  }
  return "network error";
}
