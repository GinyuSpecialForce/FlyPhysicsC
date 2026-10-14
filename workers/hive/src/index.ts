/**
 * The live hive endpoint — a tiny anonymous write/read corpus for the fly.
 *
 * Runtime model: Cloudflare Workers passes kv_namespace bindings through the
 * `env` parameter of fetch(request, env, ctx). wrangler's deploy output calls
 * it `env.KV`, so we read it from `env.KV` rather than expecting a global.
 *
 * Design (concurrent-safe without CAS, O(1) read path):
 *  - Each *contribution* is an immutable record under one KV key:
 *      v:<entryHash>:<installId>  →  { hash, text, topic, verdict, units, keywords, installId, ts }
 *    Two visitors teaching the same phrasing share an entryHash but differ in
 *    installId, so their records never clobber; two clicks from one visitor are
 *    idempotent (same key, same value).
 *  - A pre-merged snapshot is cached under `corpus:snapshot` and refreshed on
 *    every write that adds a new contribution, so GET is a single KV read
 *    instead of an N+1 key scan. If the snapshot key is absent (first boot or
 *    TTL expiry), GET rebuilds it with bounded concurrency and caches the result.
 *  - A POST dedups its own batch first: within one request, one submitter never
 *    contributes the same (entryHash, installId) twice. This bounds the cheapest
 *    inflation path (the same visitor re-posting the same entries in one request)
 *    without inventing auth.
 *  - Absent install ids are filled with a request-wide anonymous token, so one
 *    id-less submitter is one contributor per request, not many. The app sends
 *    its real install id as `from: [installId]` (older clients set `installId`);
 *    both spellings are read.
 *  - GET supports `?since=<ISO|ms>` incremental pulls and `If-None-Match` ETag
 *    conditional requests.
 *
 * The client sanitizes before it sends; the server sanitizes again because the
 * wire is untrusted. Topic list, feature bounds, and verdict ordering are
 * mirrored from the app.
 */

const TOPICS = [
  "kinematics",
  "newton",
  "energy",
  "momentum",
  "rotation",
  "shm",
  "gravitation",
  "electrostatics",
  "capacitors",
  "circuits",
  "magnetism",
  "induction",
] as const;
type Topic = (typeof TOPICS)[number];

const VERDICT_ORDER: Record<string, number> = { wrong: 0, right: 1, taught: 2 };
const VERDICTS = new Set(["wrong", "right", "taught"]);

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, If-None-Match",
  "Access-Control-Expose-Headers": "ETag",
};

const KV_PREFIX = "v:";
const SNAPSHOT_KEY = "corpus:snapshot";
const META_KEY = "meta";
const RATE_LIMIT_KEY_PREFIX = "rl:";
const RATE_LIMIT_WINDOW_SEC = 60;
const RATE_LIMIT_MAX = 60; // posts per IP per minute
const POST_MAX_ENTRIES = 200;
const POST_MAX_TEXT = 240;
const POST_MAX_CONTRIBUTORS = 12;
const VOTE_CAP = 8;
const CORPUS_MAX_ENTRIES = 20000;
const LIST_PAGE_SIZE = 1000;
const KV_READ_CONCURRENCY = 32;

/** Feature vector bounds mirrored from src/core/features.ts. */
const N_UNIT_FEATURES = 29;
const N_KEYWORD_FEATURES = 66;
const N_INPUT_FEATURES = N_UNIT_FEATURES + N_KEYWORD_FEATURES;

export interface KVNamespace {
  get(key: string, options?: { type?: "json" | "arrayBuffer" | "stream" }): Promise<string | null>;
  put(
    key: string,
    value: string | ArrayBuffer | Uint8Array | Record<string, unknown>,
    options?: { expirationTtl?: number; expiration?: number },
  ): Promise<void>;
  delete?(key: string): Promise<void>;
  list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
    start?: string;
    end?: string;
  }): Promise<{ keys: Array<{ name: string; expiration?: number }>; cursor?: string }>;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

function kvFromEnv(env: { KV?: KVNamespace }): KVNamespace {
  const kv = env.KV;
  if (!kv || typeof kv.get !== "function") {
    throw new Error(
      "KV binding not found in env — expected env.KV (a kv_namespace binding named KV in wrangler.jsonc)",
    );
  }
  return kv;
}

// ── worker entrypoint ──────────────────────────────────────────────────

export default {
  async fetch(
    request: Request,
    env: Record<string, unknown> & { KV?: KVNamespace },
    _ctx?: ExecutionContext,
  ): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (request.method === "GET") {
      return await handleGet(request, kvFromEnv(env));
    }
    if (request.method === "POST") {
      return await handlePost(request, kvFromEnv(env));
    }
    return new Response("method not allowed", { status: 405, headers: corsHeaders });
  },
};

// ── GET: fast cached snapshot + optional ?since filter ─────────────────

interface SnapshotPayload {
  version: 1;
  generatedAt: string;
  entries: MergedEntry[];
}

async function handleGet(request: Request, kv: KVNamespace): Promise<Response> {
  const snapshot = await loadOrRebuildSnapshot(kv);
  const url = new URL(request.url);
  const sinceParam = url.searchParams.get("since");
  const sinceMs = parseSince(sinceParam);

  const entries =
    sinceMs !== null
      ? snapshot.entries.filter((e) => (e.updatedAt ?? 0) > sinceMs).map(stripInternalFields)
      : snapshot.entries.map(stripInternalFields);

  const etag = `"v1-${snapshot.generatedAt}-${entries.length}"`;
  const ifNoneMatch = request.headers.get("If-None-Match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ...corsHeaders,
        ETag: etag,
        "Cache-Control": "public, max-age=5, stale-while-revalidate=25",
      },
    });
  }

  return json(
    {
      version: 1,
      generatedAt: snapshot.generatedAt,
      entries,
    },
    200,
    {
      ETag: etag,
      "Cache-Control": "public, max-age=5, stale-while-revalidate=25",
    },
  );
}

function parseSince(raw: string | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const asNum = Number(trimmed);
  if (Number.isFinite(asNum) && asNum > 0) return asNum;
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function stripInternalFields(entry: MergedEntry): Omit<MergedEntry, "updatedAt"> {
  const { updatedAt: _u, ...rest } = entry;
  return rest;
}

async function loadOrRebuildSnapshot(kv: KVNamespace): Promise<SnapshotPayload> {
  const cached = await kvGet(kv, SNAPSHOT_KEY);
  if (
    cached &&
    cached.version === 1 &&
    typeof cached.generatedAt === "string" &&
    Array.isArray(cached.entries)
  ) {
    return cached as unknown as SnapshotPayload;
  }
  return await rebuildSnapshot(kv);
}

async function rebuildSnapshot(kv: KVNamespace): Promise<SnapshotPayload> {
  const entries = await mergedCorpus(kv);
  const snapshot: SnapshotPayload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    entries,
  };
  await kvPut(kv, SNAPSHOT_KEY, JSON.stringify(snapshot));
  return snapshot;
}

/** Mutable accumulator for one entry hash while we merge its contributions. */
interface GroupAcc {
  text: string;
  topic: string;
  units: number[];
  keywords: number[];
  verdict: string;
  contributors: Set<string>;
  count: number;
  updatedAt: number;
}

async function mergedCorpus(kv: KVNamespace): Promise<MergedEntry[]> {
  const groups = new Map<string, GroupAcc>();

  const names: string[] = [];
  let cursor: string | undefined;
  let page: { keys: Array<{ name: string }>; cursor?: string } | null;
  do {
    page = await kv.list({ prefix: KV_PREFIX, limit: LIST_PAGE_SIZE, cursor });
    if (!page) break;
    for (const { name } of page.keys) names.push(name);
    cursor = page.cursor;
  } while (page && page.cursor);

  for (let i = 0; i < names.length; i += KV_READ_CONCURRENCY) {
    const slice = names.slice(i, i + KV_READ_CONCURRENCY);
    const records = await Promise.all(slice.map((name) => kvGet(kv, name)));
    for (const record of records) {
      if (!record) continue;
      const hash =
        typeof record.hash === "string" && record.hash.length > 0
          ? record.hash
          : await entryHash(
              typeof record.text === "string" ? record.text : "",
              typeof record.topic === "string" ? record.topic : "",
            );
      if (typeof hash !== "string" || hash.length === 0) continue;
      const units = cleanUnits(record.units);
      const keywords = cleanKeywords(record.keywords);
      if (units.length === 0 && keywords.length === 0) continue;
      const ts = typeof record.ts === "number" && Number.isFinite(record.ts) ? record.ts : 0;
      const group = groups.get(hash) ?? {
        text: typeof record.text === "string" ? record.text : "",
        topic: typeof record.topic === "string" ? record.topic : "",
        units,
        keywords,
        verdict: typeof record.verdict === "string" ? record.verdict : "wrong",
        contributors: new Set<string>(),
        count: 0,
        updatedAt: ts,
      };
      if (typeof record.text === "string") group.text = record.text;
      if (typeof record.topic === "string") group.topic = record.topic;
      if (units.length > 0) group.units = units;
      if (keywords.length > 0) group.keywords = keywords;
      if (
        typeof record.verdict === "string" &&
        (VERDICT_ORDER[group.verdict] ?? -1) < (VERDICT_ORDER[record.verdict] ?? -1)
      ) {
        group.verdict = record.verdict;
      }
      if (typeof record.installId === "string" && record.installId.length > 0) {
        group.contributors.add(record.installId);
      }
      if (ts > group.updatedAt) group.updatedAt = ts;
      group.count++;
      groups.set(hash, group);
    }
  }

  const entries: MergedEntry[] = [];
  for (const group of groups.values()) {
    if (entries.length >= CORPUS_MAX_ENTRIES) break;
    const distinctCount = group.contributors.size > 0 ? group.contributors.size : group.count;
    entries.push({
      text: group.text,
      topic: group.topic,
      units: group.units,
      keywords: group.keywords,
      verdict: group.verdict,
      votes: Math.min(Math.max(distinctCount, 1), VOTE_CAP),
      from: [...group.contributors].slice(0, POST_MAX_CONTRIBUTORS).sort(),
      ...(group.updatedAt > 0 ? { updatedAt: group.updatedAt } : {}),
    });
  }

  entries.sort((a, b) => {
    if (a.text < b.text) return -1;
    if (a.text > b.text) return 1;
    if (a.topic < b.topic) return -1;
    if (a.topic > b.topic) return 1;
    return 0;
  });

  return entries;
}

// ── POST: append contributions ────────────────────────────────────────

async function handlePost(request: Request, kv: KVNamespace): Promise<Response> {
  const ip = clientIp(request);
  if (!(await checkRateLimit(kv, ip))) {
    return json({ error: "rate limited", detail: "too many requests from this address" }, 429);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "bad payload", detail: "body must be JSON" }, 400);
  }

  const entries = arrayOf(payload);
  if (entries.length === 0) {
    return json({ error: "nothing to upload" }, 400);
  }
  if (entries.length > POST_MAX_ENTRIES) {
    return json({ error: "too many entries", detail: `maximum ${POST_MAX_ENTRIES} per post` }, 400);
  }

  // One anonymous submitter per request: an id-less caller is one contributor
  // here, no matter how many entries (or repeats) it sends.
  const fallbackId = absentId();

  // Collapse in-batch duplicates from the same contributor before hitting KV.
  const batch = dedupedBatch(entries, fallbackId);

  const sanitizedList = await Promise.all(batch.map((raw) => sanitizeEntry(raw, fallbackId)));
  const accepted: Array<{ ok: boolean; reason?: string; installId?: string }> = [];
  const candidates: SanitizedEntry[] = [];

  for (let i = 0; i < batch.length; i++) {
    const entry = sanitizedList[i];
    if (!entry) {
      accepted.push({ ok: false, reason: "rejected: " + sanitizeReason(batch[i]) });
      continue;
    }
    accepted.push({ ok: true, installId: entry.installId });
    candidates.push(entry);
  }

  let wroteNew = false;
  for (let i = 0; i < candidates.length; i += KV_READ_CONCURRENCY) {
    const slice = candidates.slice(i, i + KV_READ_CONCURRENCY);
    const existingList = await Promise.all(
      slice.map((entry) => kvGet(kv, contributionKey(entry.hash, entry.installId))),
    );
    const writes: Promise<void>[] = [];
    for (let j = 0; j < slice.length; j++) {
      const entry = slice[j];
      const existing = existingList[j];
      if (!existing) {
        wroteNew = true;
        writes.push(kvPut(kv, contributionKey(entry.hash, entry.installId), contributionValue(entry)));
      } else if (
        typeof existing.verdict === "string" &&
        (VERDICT_ORDER[existing.verdict] ?? -1) < (VERDICT_ORDER[entry.verdict] ?? -1)
      ) {
        // Upgrade verdict when the same contributor later corrects ("taught") an earlier "right"/"wrong".
        wroteNew = true;
        writes.push(kvPut(kv, contributionKey(entry.hash, entry.installId), contributionValue(entry)));
      }
    }
    if (writes.length > 0) await Promise.all(writes);
  }

  const snapshot = wroteNew ? await rebuildSnapshot(kv) : await loadOrRebuildSnapshot(kv);
  if (wroteNew) {
    await kvPut(
      kv,
      META_KEY,
      JSON.stringify({ count: snapshot.entries.length, generatedAt: snapshot.generatedAt }),
      { expirationTtl: 60 * 60 * 24 * 30 },
    );
  }

  const publicEntries = snapshot.entries.map(stripInternalFields);
  return json({
    ok: true,
    accepted: accepted.filter((a) => a.ok).length,
    rejected: accepted.length - accepted.filter((a) => a.ok).length,
    corpusEntries: publicEntries.length,
    distinctContributorsInBatch: distinctContributorCount(accepted),
    version: 1,
    generatedAt: snapshot.generatedAt,
    entries: publicEntries,
  });
}

/**
 * Keep one representative per (text, topic, installId) within the POST batch.
 * If the same submitter sends both "right" and "taught" for the same phrasing
 * in one batch, keep the stronger verdict.
 */
function dedupedBatch(entries: unknown[], fallbackId: string): unknown[] {
  const byKey = new Map<string, { raw: unknown; verdictRank: number }>();
  for (const raw of entries) {
    const e = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    if (!e) continue;
    const installId = contributorIdOf(e, fallbackId);
    const text = typeof e.text === "string" ? cleanText(e.text) : "";
    const topic =
      typeof e.topic === "string" && TOPICS.includes(e.topic as Topic) ? e.topic : "";
    const verdictRank = typeof e.verdict === "string" ? (VERDICT_ORDER[e.verdict] ?? -1) : -1;
    const key = `${fnv1aPreview(text + "\0" + topic)}:${installId}`;
    const prior = byKey.get(key);
    if (!prior || verdictRank > prior.verdictRank) {
      byKey.set(key, { raw, verdictRank });
    }
  }
  return [...byKey.values()].map((v) => v.raw);
}

/** A sync FNV-1a preview of the (text, topic) hash, used only for in-memory batch dedup. */
function fnv1aPreview(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** The anonymous token for one request — callers generate it exactly once. */
function absentId(): string {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return "auto-" + Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Who a contribution is attributed to: an explicit `installId` if the client
 * sent one, else the first entry of the app's `from` contributor list (the app
 * sends `from: [installId]`), else the request-wide anonymous token.
 */
function contributorIdOf(e: { installId?: unknown; from?: unknown }, fallbackId: string): string {
  if (typeof e.installId === "string") {
    const id = e.installId.trim().slice(0, 64);
    if (id.length > 0) return id;
  }
  if (Array.isArray(e.from)) {
    for (const v of e.from) {
      if (typeof v === "string") {
        const id = v.trim().slice(0, 64);
        if (id.length > 0) return id;
      }
    }
  }
  return fallbackId;
}

function distinctContributorCount(
  accepted: Array<{ ok: boolean; reason?: string; installId?: string }>,
): number {
  const ids = new Set<string>();
  for (const a of accepted) {
    if (!a.ok) continue;
    if (a.installId) ids.add(a.installId);
  }
  return ids.size;
}

// ── server-side sanitizer (mirrors the app's corpus rules) ────────────

interface RawEntry {
  text?: unknown;
  topic?: unknown;
  verdict?: unknown;
  units?: unknown;
  keywords?: unknown;
  votes?: unknown;
  from?: unknown;
  installId?: unknown;
}

interface SanitizedEntry {
  hash: string;
  text: string;
  topic: string;
  verdict: string;
  units: number[];
  keywords: number[];
  installId: string;
}

async function sanitizeEntry(raw: unknown, fallbackId: string): Promise<SanitizedEntry | null> {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as RawEntry;
  if (typeof e.text !== "string") return null;
  const text = cleanText(e.text);
  if (!text || text.length > POST_MAX_TEXT) return null;
  if (typeof e.topic !== "string" || !TOPICS.includes(e.topic as Topic)) return null;
  const topic = e.topic as Topic;
  if (typeof e.verdict !== "string" || !VERDICTS.has(e.verdict)) return null;
  const verdict = e.verdict;
  const units = cleanUnits(e.units);
  const keywords = cleanKeywords(e.keywords);
  if (units.length === 0 && keywords.length === 0) return null;
  const installId = contributorIdOf(e, fallbackId);
  const hash = await entryHash(text, topic);
  return { hash, text, topic, verdict, units, keywords, installId };
}

function sanitizeReason(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "not an object";
  const e = raw as RawEntry;
  if (typeof e.text !== "string") return "missing text";
  const t = cleanText(e.text);
  if (!t) return "text empty after cleanup";
  if (t.length > POST_MAX_TEXT) return "text too long";
  if (typeof e.topic !== "string" || !TOPICS.includes(e.topic as Topic)) return "bad topic";
  if (typeof e.verdict !== "string" || !VERDICTS.has(e.verdict)) return "bad verdict";
  const units = cleanUnits(e.units);
  const keywords = cleanKeywords(e.keywords);
  if (units.length === 0 && keywords.length === 0) return "no valid units or keywords";
  return "rejected";
}

function cleanText(s: string): string {
  let out = s.toLowerCase().slice(0, POST_MAX_TEXT * 4);
  out = out
    .replace(/[^a-z0-9. ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !/^\d*\.?\d*$/.test(w))
    .join(" ");
  return out.slice(0, POST_MAX_TEXT).trim();
}

/**
 * Validate sparse unit pairs `[familyIndex, count, ...]`, keeping only
 * in-range integer indices `[0, N_UNIT_FEATURES)` and positive finite counts.
 */
function cleanUnits(raw: unknown): number[] {
  const nums = finiteNumbers(raw).slice(0, 2 * N_INPUT_FEATURES);
  const even = nums.length % 2 === 0 ? nums : nums.slice(0, -1);
  const out: number[] = [];
  for (let i = 0; i + 1 < even.length; i += 2) {
    const idx = even[i];
    const count = even[i + 1];
    if (Number.isInteger(idx) && idx >= 0 && idx < N_UNIT_FEATURES && count > 0 && count <= 100) {
      out.push(idx, count);
    }
  }
  return out;
}

/**
 * Validate sparse keyword indices, keeping only distinct integers in
 * `[0, N_KEYWORD_FEATURES)`.
 */
function cleanKeywords(raw: unknown): number[] {
  const nums = finiteNumbers(raw).slice(0, N_INPUT_FEATURES);
  const seen = new Set<number>();
  const out: number[] = [];
  for (const k of nums) {
    if (Number.isInteger(k) && k >= 0 && k < N_KEYWORD_FEATURES && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

function finiteNumbers(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const v of raw) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

// ── hashing ────────────────────────────────────────────────────────────

async function entryHash(text: string, topic: string): Promise<string> {
  const buf = new TextEncoder().encode(text + "\0" + topic);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(digest);
  let out = "";
  for (let i = 0; i < 8; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

// ── KV helpers ────────────────────────────────────────────────────────

async function kvGet(kv: KVNamespace, key: string): Promise<Record<string, unknown> | null> {
  const raw = await kv.get(key);
  if (!raw || typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function kvPut(
  kv: KVNamespace,
  key: string,
  value: string,
  opts?: { expirationTtl?: number },
): Promise<void> {
  await kv.put(key, value, opts);
}

function contributionKey(hash: string, installId: string): string {
  return `${KV_PREFIX}${hash}:${installId}`;
}

function contributionValue(e: SanitizedEntry): string {
  return JSON.stringify({
    hash: e.hash,
    text: e.text,
    topic: e.topic,
    verdict: e.verdict,
    units: e.units,
    keywords: e.keywords,
    installId: e.installId,
    ts: Date.now(),
  });
}

interface MergedEntry {
  text: string;
  topic: string;
  units: number[];
  keywords: number[];
  verdict: string;
  votes: number;
  from: string[];
  updatedAt?: number;
}

// ── rate limiting (fixed window per IP, stored in KV) ────────────────

async function checkRateLimit(kv: KVNamespace, ip: string): Promise<boolean> {
  const key = `${RATE_LIMIT_KEY_PREFIX}${ip}`;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_SEC * 1000;
  const raw = await kvGet(kv, key);
  const stored = raw && typeof raw === "object" ? raw : null;
  const inWindow =
    stored &&
    typeof stored.count === "number" &&
    typeof stored.when === "number" &&
    stored.when > windowStart;
  const count = inWindow ? (stored.count as number) : 0;
  const windowAnchor = inWindow ? (stored.when as number) : now;
  if (count >= RATE_LIMIT_MAX) return false;
  await kvPut(kv, key, JSON.stringify({ count: count + 1, when: windowAnchor }), {
    expirationTtl: RATE_LIMIT_WINDOW_SEC,
  });
  return true;
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

// ── tiny JSON helper ──────────────────────────────────────────────────

function json(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders, ...extraHeaders },
  });
}

function arrayOf(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { entries?: unknown }).entries)
  ) {
    return (payload as { entries: unknown[] }).entries;
  }
  return [];
}
