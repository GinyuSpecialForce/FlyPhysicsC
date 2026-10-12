/**\n * The live hive endpoint — a tiny anonymous write/read corpus for the fly.\n *\n * Runtime model: Cloudflare Workers passes kv_namespace bindings through the\n * `env` parameter of fetch(request, env, ctx). wrangler's deploy output calls\n * it `env.KV`, so we read it from `env.KV` rather than expecting a global.\n *\n * Design (concurrent-safe without CAS):\n *  - Each *contribution* is an immutable record under one KV key:\n *      v:<entryHash>:<installId>  →  { text, topic, verdict, units, keywords, ts }\n *    Two visitors teaching the same phrasing share an entryHash but differ in\n *    installId, so their records never clobber; two clicks from one visitor are\n *    idempotent (same key, same value).\n *  - A POST dedups its own batch first: within one request, one submitter never\n *    contributes the same (entryHash, installId) twice. This bounds the cheapest\n *    inflation path (the same visitor re-posting the same entries in one request)\n *    without inventing auth.\n *  - Absent install ids are filled with a request-wide anonymous token, so one\n *    id-less submitter is one contributor per request, not many. The app sends\n *    its real install id as `from: [installId]` (older clients set `installId`);\n *    both spellings are read.\n *  - GET lists every v:* key, groups by entryHash, merges each group into one\n *    canonical entry (votes = capped distinct contributors, verdict = strongest).\n *  - POST puts each contribution (create-if-absent), updates a meta counter, and\n *    is rate-limited per IP with a fixed window.\n *\n * The client sanitizes before it sends; the server sanitizes again because the\n * wire is untrusted. Topic list + verdict ordering are mirrored from the app.\n */

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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const KV_PREFIX = "v:";
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

// ── KV binding (from env, per the new Workers model) ──────────────────

declare const KVNamespace: {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  list(opts: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: Array<{ name: string; expiration?: number }>;
    cursor?: string;
  }>;
};

function kvFromEnv(env: { KV?: KVNamespace }): KVNamespace {
  const kv = env.KV;
  if (!kv || typeof (kv as KVNamespace).get !== "function") {
    throw new Error(
      "KV binding not found in env — expected env.KV (a kv_namespace binding named KV in wrangler.jsonc)",
    );
  }
  return kv as KVNamespace;
}

// ── worker entrypoint ──────────────────────────────────────────────────

export default {
  async fetch(
    request: Request,
    env: Record<string, unknown> & { KV?: KVNamespace },
    _ctx: ExecutionContext = new ExecutionContext(),
  ): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    if (request.method === "GET") {
      return await handleGet(kvFromEnv(env));
    }
    if (request.method === "POST") {
      return await handlePost(request, kvFromEnv(env));
    }
    return new Response("method not allowed", { status: 405, headers: corsHeaders });
  },
};

// ── GET: list + merge the canonical corpus ────────────────────────────

async function handleGet(kv: KVNamespace): Promise<Response> {
  const entries = await mergedCorpus(kv);
  return json({
    version: 1,
    generatedAt: new Date().toISOString(),
    entries,
  });
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
}

async function mergedCorpus(kv: KVNamespace): Promise<MergedEntry[]> {
  const groups = new Map<string, GroupAcc>();

  let cursor: string | undefined;
  let page: { keys: Array<{ name: string }>; cursor?: string } | null;
  do {
    page = await kv.list({ prefix: KV_PREFIX, limit: LIST_PAGE_SIZE, cursor });
    if (!page) break;
    for (const { name } of page.keys) {
      const record = await kvGet(kv, name);
      if (!record) continue;
      const hash =
        typeof record.hash === "string" && record.hash.length > 0
          ? record.hash
          : (await entryHash(
              typeof record.text === "string" ? record.text : "",
              typeof record.topic === "string" ? record.topic : "",
            ));
      if (typeof hash !== "string" || hash.length === 0) continue;
      const group = groups.get(hash) ?? {
        text: typeof record.text === "string" ? record.text : "",
        topic: typeof record.topic === "string" ? record.topic : "",
        units: Array.isArray(record.units) ? record.units : [],
        keywords: Array.isArray(record.keywords) ? record.keywords : [],
        verdict: typeof record.verdict === "string" ? record.verdict : "wrong",
        contributors: new Set<string>(),
        count: 0,
      };
      if (typeof record.text === "string") group.text = record.text;
      if (typeof record.topic === "string") group.topic = record.topic;
      if (Array.isArray(record.units)) group.units = record.units;
      if (Array.isArray(record.keywords)) group.keywords = record.keywords;
      if (
        typeof record.verdict === "string" &&
        VERDICT_ORDER[group.verdict] < VERDICT_ORDER[record.verdict]
      ) {
        group.verdict = record.verdict;
      }
      if (typeof record.installId === "string") group.contributors.add(record.installId);
      group.count++;
      groups.set(hash, group);
    }
    cursor = page.cursor;
  } while (page && page.cursor);

  const entries: MergedEntry[] = [];
  for (const group of groups.values()) {
    if (entries.length >= CORPUS_MAX_ENTRIES) break;
    entries.push({
      text: group.text,
      topic: group.topic,
      units: group.units,
      keywords: group.keywords,
      verdict: group.verdict,
      votes: Math.min(group.count, VOTE_CAP),
      from: [...group.contributors].slice(0, POST_MAX_CONTRIBUTORS).sort(),
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

async function handlePost(
  request: Request,
  kv: KVNamespace,
): Promise<Response> {
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

  // One submitter can repeat the same (entryHash, installId) a few times in a
  // single request (e.g. a buggy client retrying), but we never write it more
  // than once per batch — that is the cheapest inflation path and this closes it.
  const batch = dedupedBatch(entries, fallbackId);

  const accepted: Array<{ ok: boolean; reason?: string; installId?: string }> = [];
  for (const raw of batch) {
    const entry = await sanitizeEntry(raw, fallbackId);
    if (!entry) {
      accepted.push({ ok: false, reason: "rejected: " + sanitizeReason(raw) });
      continue;
    }
    const key = contributionKey(entry.hash, entry.installId);
    const existing = await kvGet(kv, key);
    if (!existing) {
      await kvPut(kv, key, contributionValue(entry));
    }
    accepted.push({ ok: true, installId: entry.installId });
  }

  await kvPut(
    kv,
    META_KEY,
    JSON.stringify({ count: Date.now(), generatedAt: new Date().toISOString() }),
    { expirationTtl: 60 * 60 * 24 * 30 },
  );

  const merged = await mergedCorpus(kv);
  return json({
    ok: true,
    accepted: accepted.filter((a) => a.ok).length,
    rejected: accepted.length - accepted.filter((a) => a.ok).length,
    corpusEntries: merged.length,
    distinctContributorsInBatch: distinctContributorCount(accepted),
    version: 1,
    generatedAt: new Date().toISOString(),
    entries: merged,
  });
}

/** Keep one representative per (text, topic, installId) within the POST batch.
 *
 * The server-side sanitizeEntry already computes a true SHA-256 entry hash, but
 * we need a sync key here before we've validated/sanitized. The preview hash
 * is only used to collapse exact in-batch repeats — a collision here can at
 * worst drop one repeated submission, never create a new one.
 */
function dedupedBatch(entries: unknown[], fallbackId: string): unknown[] {
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const raw of entries) {
    const e = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    if (!e) continue;
    const installId = contributorIdOf(e, fallbackId);
    const text =
      typeof e.text === "string" ? e.text.slice(0, POST_MAX_TEXT).trim() : "";
    const topic =
      typeof e.topic === "string" && TOPICS.includes(e.topic as Topic) ? e.topic : "";
    const key = `${fnv1aPreview(text + "\0" + topic)}:${installId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }
  return out;
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
  if (typeof e.installId === "string" && e.installId.length > 0) return e.installId;
  if (Array.isArray(e.from)) {
    const first = e.from.find((v): v is string => typeof v === "string" && v.length > 0);
    if (first) return first;
  }
  return fallbackId;
}

function distinctContributorCount(accepted: Array<{ ok: boolean; reason?: string; installId?: string }>): number {
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
  if (!text) return null;
  if (text.length > POST_MAX_TEXT) return null;
  if (typeof e.topic !== "string" || !TOPICS.includes(e.topic as Topic)) return null;
  const topic = e.topic as Topic;
  if (typeof e.verdict !== "string" || !VERDICTS.has(e.verdict)) return null;
  const verdict = e.verdict;
  const units = finiteNumbers(e.units).slice(0, 256);
  const keywords = finiteNumbers(e.keywords).slice(0, 128);
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
}

// ── rate limiting (fixed window per IP, stored in KV) ────────────────

async function checkRateLimit(kv: KVNamespace, ip: string): Promise<boolean> {
  const key = `${RATE_LIMIT_KEY_PREFIX}${ip}`;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_SEC * 1000;
  const raw = await kvGet(kv, key);
  const stored =
    raw && typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : null;
  const count =
    stored &&
    typeof stored.count === "number" &&
    typeof stored.when === "number" &&
    stored.when > windowStart
      ? stored.count
      : 0;
  if (count >= RATE_LIMIT_MAX) return false;
  await kvPut(kv, key, JSON.stringify({ count: count + 1, when: now }), {
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
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

// minimal ExecutionContext shim for local typecheck; provided by the runtime.
declare class ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
