import { describe, expect, it } from "vitest";
import worker from "../workers/hive/src/index";

/** In-memory Cloudflare KV Namespace mock for testing the worker directly. */
function createMockKV() {
  const store = new Map<string, string>();
  let getCalls = 0;
  let putCalls = 0;
  let listCalls = 0;

  const kv = {
    store,
    stats: () => ({ getCalls, putCalls, listCalls }),
    resetStats: () => {
      getCalls = 0;
      putCalls = 0;
      listCalls = 0;
    },
    async get(key: string): Promise<string | null> {
      getCalls++;
      return store.get(key) ?? null;
    },
    async put(key: string, value: string): Promise<void> {
      putCalls++;
      store.set(key, value);
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
    async list(opts: { prefix?: string; limit?: number; cursor?: string } = {}) {
      listCalls++;
      const prefix = opts.prefix ?? "";
      const keys = [...store.keys()]
        .filter((k) => k.startsWith(prefix))
        .sort()
        .map((name) => ({ name }));
      return { keys, cursor: undefined };
    },
  };
  return kv;
}

describe("Cloudflare Worker — workers/hive", () => {
  it("answers OPTIONS preflight with 204 and CORS headers", async () => {
    const kv = createMockKV();
    const res = await worker.fetch(
      new Request("https://hive.test/", { method: "OPTIONS" }),
      { KV: kv as never },
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("caches the merged snapshot so repeated GETs take 1 KV read instead of N+1", async () => {
    const kv = createMockKV();
    const postRes = await worker.fetch(
      new Request("https://hive.test/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: 1,
          entries: [
            {
              text: "block slides down frictionless incline",
              topic: "newton",
              verdict: "taught",
              units: [1, 1],
              keywords: [5],
              from: ["dev-1"],
            },
            {
              text: "orbital period satellite planet",
              topic: "gravitation",
              verdict: "right",
              units: [0, 1],
              keywords: [33],
              from: ["dev-2"],
            },
          ],
        }),
      }),
      { KV: kv as never },
    );
    expect(postRes.status).toBe(200);
    const postBody = (await postRes.json()) as { accepted: number; entries: unknown[] };
    expect(postBody.accepted).toBe(2);
    expect(postBody.entries).toHaveLength(2);

    // Reset KV counters and issue a GET: it should read only `corpus:snapshot` (1 get, 0 list)
    kv.resetStats();
    const getRes = await worker.fetch(new Request("https://hive.test/"), { KV: kv as never });
    expect(getRes.status).toBe(200);
    expect(kv.stats()).toEqual({ getCalls: 1, putCalls: 0, listCalls: 0 });

    // Conditional GET with matching ETag returns 304 Not Modified
    const etag = getRes.headers.get("ETag");
    expect(etag).toBeTruthy();
    const cachedRes = await worker.fetch(
      new Request("https://hive.test/", { headers: { "If-None-Match": etag! } }),
      { KV: kv as never },
    );
    expect(cachedRes.status).toBe(304);
  });

  it("upgrades a contributor's verdict from right to taught without inflating votes", async () => {
    const kv = createMockKV();
    const send = (verdict: string) =>
      worker.fetch(
        new Request("https://hive.test/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entries: [
              {
                text: "spring mass period oscillation",
                topic: "shm",
                verdict,
                units: [0, 1],
                keywords: [14],
                from: ["dev-1"],
              },
            ],
          }),
        }),
        { KV: kv as never },
      );

    await send("right");
    const second = await send("taught");
    const body = (await second.json()) as {
      entries: Array<{ verdict: string; votes: number; from: string[] }>;
    };
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].votes).toBe(1);
    expect(body.entries[0].verdict).toBe("taught");
  });

  it("rejects out-of-range or malformed unit/keyword indices", async () => {
    const kv = createMockKV();
    const res = await worker.fetch(
      new Request("https://hive.test/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: [
            {
              text: "hostile indices only",
              topic: "newton",
              verdict: "taught",
              units: [999, 1, -3, 2],
              keywords: [9999, -1],
              from: ["dev-bad"],
            },
          ],
        }),
      }),
      { KV: kv as never },
    );
    const body = (await res.json()) as { accepted: number; rejected: number; entries: unknown[] };
    expect(body.accepted).toBe(0);
    expect(body.rejected).toBe(1);
    expect(body.entries).toHaveLength(0);
  });

  it("supports ?since=<ISO> incremental pulls", async () => {
    const kv = createMockKV();
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();

    await worker.fetch(
      new Request("https://hive.test/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: [
            {
              text: "block slides down frictionless incline",
              topic: "newton",
              verdict: "taught",
              units: [1, 1],
              keywords: [5],
              from: ["dev-1"],
            },
          ],
        }),
      }),
      { KV: kv as never },
    );

    const resPast = await worker.fetch(
      new Request(`https://hive.test/?since=${encodeURIComponent(past)}`),
      { KV: kv as never },
    );
    expect(((await resPast.json()) as { entries: unknown[] }).entries).toHaveLength(1);

    const resFuture = await worker.fetch(
      new Request(`https://hive.test/?since=${encodeURIComponent(future)}`),
      { KV: kv as never },
    );
    expect(((await resFuture.json()) as { entries: unknown[] }).entries).toHaveLength(0);
  });
});
