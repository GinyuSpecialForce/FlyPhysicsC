import { describe, expect, it } from "vitest";
import { HiveStore, browserStorage, KEYS, type KeyValueStore } from "../src/core/hive-store";
import { HiveSync, httpTransport, configuredEndpoint } from "../src/core/sync";
import { Network } from "../src/core/network";
import { Rng } from "../src/core/rng";
import { makeEntry, mergeCorpora, type HiveEntry } from "../src/core/corpus";

/** A localStorage stand-in, so this whole file runs in the node test env. */
function fakeStorage(seed: Record<string, string> = {}): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

/** Storage that always throws on write, like a full quota in a browser. */
const fullStorage: KeyValueStore = {
  getItem: () => null,
  setItem: () => {
    throw new DOMException("QuotaExceededError");
  },
  removeItem: () => undefined,
};

function entry(text: string, topic: HiveEntry["topic"] = "newton"): HiveEntry {
  return { text, topic, units: [0, 1], keywords: [1], verdict: "taught", votes: 1 };
}

const META = { seed: 1337, epochs: 6, samples: 600, evalAccuracy: 0.9 };

describe("HiveStore — this device's memory", () => {
  it("survives a reload", () => {
    const storage = fakeStorage();
    const first = new HiveStore(storage);
    first.addEntries([entry("incline friction normal force")]);
    const second = new HiveStore(storage); // same storage = a page reload
    expect(second.loadEntries()).toHaveLength(1);
  });

  it("merges rather than replaces on add", () => {
    const store = new HiveStore(fakeStorage());
    store.addEntries([entry("incline friction")]);
    const merged = store.addEntries([entry("orbital period")]);
    expect(merged).toHaveLength(2);
    expect(store.loadEntries()).toHaveLength(2);
  });

  it("counts votes when the same teach is added again", () => {
    const store = new HiveStore(fakeStorage());
    store.addEntries([entry("incline friction")]);
    const merged = store.addEntries([entry("incline friction")]);
    expect(merged[0].votes).toBe(2);
  });

  it("discards corrupt storage rather than failing to boot", () => {
    const store = new HiveStore(fakeStorage({ [KEYS.corpus]: "{not json" }));
    expect(store.loadEntries()).toEqual([]);
  });

  it("discards a stored corpus in a format it does not know", () => {
    const store = new HiveStore(fakeStorage({ [KEYS.corpus]: JSON.stringify({ version: 42, entries: [] }) }));
    expect(store.loadEntries()).toEqual([]);
  });

  it("keeps the learned-problem set across reloads", () => {
    const storage = fakeStorage();
    new HiveStore(storage).saveLearned(["p1", "p2", "p1"]);
    expect(new HiveStore(storage).loadLearned()).toEqual(["p1", "p2"]);
  });

  it("ignores junk in the learned set", () => {
    const store = new HiveStore(fakeStorage({ [KEYS.learned]: JSON.stringify(["ok", 7, null, {}]) }));
    expect(store.loadLearned()).toEqual(["ok"]);
  });

  it("keeps this device's own learning across reloads", () => {
    const storage = fakeStorage();
    const net = new Network(new Rng(1337));
    net.trainStep(new Array(95).fill(0.1), 3, 0.2);
    new HiveStore(storage).saveWeights(net, "base-1", META);
    const restored = new HiveStore(storage).loadWeights("base-1");
    expect(restored).not.toBeNull();
    expect(restored!.w0[0][0]).toBeCloseTo(net.w0[0][0], 6);
  });

  it("drops local weights when the site ships a different brain", () => {
    // the teaches are still safe — they get replayed onto the new brain — but
    // weights derived from the old one mean nothing against the new layout
    const storage = fakeStorage();
    new HiveStore(storage).saveWeights(new Network(new Rng(1337)), "base-1", META);
    expect(new HiveStore(storage).loadWeights("base-2")).toBeNull();
  });

  it("forgets everything on request", () => {
    const storage = fakeStorage();
    const store = new HiveStore(storage);
    store.addEntries([entry("incline friction")]);
    store.saveLearned(["p1"]);
    store.saveWeights(new Network(new Rng(1)), "base-1", META);
    store.forget();
    expect(storage.data.size).toBe(0);
    expect(store.loadEntries()).toEqual([]);
  });

  it("still works, in memory only, when storage is blocked", () => {
    const store = new HiveStore(null);
    expect(store.persistent).toBe(false);
    expect(store.saveEntries([entry("incline friction")])).toBe(false);
    expect(store.loadEntries()).toEqual([]);
  });

  it("degrades instead of throwing when the quota is full", () => {
    const store = new HiveStore(fullStorage);
    expect(() => store.saveEntries([entry("incline friction")])).not.toThrow();
    expect(store.saveEntries([entry("incline friction")])).toBe(false);
    expect(() => store.forget()).not.toThrow();
  });

  it("reports browser storage as unavailable in a non-browser runtime", () => {
    // this test process has no localStorage, which is exactly the guard's job
    expect(browserStorage()).toBeNull();
  });
});

describe("HiveSync — live upload, when someone configures an endpoint", () => {
  it("is off, and says so, with no endpoint", async () => {
    const sync = new HiveSync({ transport: null });
    expect(sync.getState().status).toBe("off");
    expect(sync.getState().message).toContain("No hive endpoint configured");
    await expect(sync.exchange([entry("a")])).resolves.toHaveLength(1);
  });

  it("has no endpoint in the shipped build", () => {
    // nothing to configure until a store exists; the default must be safe
    expect(configuredEndpoint()).toBeNull();
  });

  it("pushes local teaches and merges what comes back", async () => {
    const pushed: HiveEntry[][] = [];
    const sync = new HiveSync({
      transport: {
        name: "test",
        pull: async () => [entry("orbital period satellite", "gravitation")],
        push: async (e) => void pushed.push([...e]),
      },
    });
    const merged = await sync.exchange([entry("incline friction")]);
    expect(pushed[0]).toHaveLength(1);
    expect(merged).toHaveLength(2);
    expect(sync.getState().status).toBe("ok");
    expect(sync.getState().received).toBe(1);
  });

  it("keeps the fly working when the hive is unreachable", async () => {
    const sync = new HiveSync({
      transport: {
        name: "test",
        pull: async () => {
          throw new Error("ECONNREFUSED");
        },
        push: async () => undefined,
      },
    });
    const local = [entry("incline friction")];
    const merged = await sync.exchange(local);
    expect(merged).toEqual(local);
    expect(sync.getState().status).toBe("error");
    expect(sync.getState().message).toContain("keeps working offline");
  });

  it("survives a push that fails", async () => {
    const sync = new HiveSync({
      transport: {
        name: "test",
        pull: async () => [],
        push: async () => {
          throw new Error("503");
        },
      },
    });
    await expect(sync.exchange([entry("a")])).resolves.toHaveLength(1);
    expect(sync.getState().status).toBe("error");
  });

  it("reports progress through onChange", async () => {
    const seen: string[] = [];
    const sync = new HiveSync({
      transport: { name: "test", pull: async () => [], push: async () => undefined },
      onChange: (s) => seen.push(s.status),
    });
    await sync.exchange([entry("a")]);
    // a "syncing" first and an "ok" last is the contract; the middle is
    // internal bookkeeping (pushed counts) and may change
    expect(seen[0]).toBe("syncing");
    expect(seen[seen.length - 1]).toBe("ok");
  });

  it("merges remote duplicates as extra votes, not a reset", async () => {
    const sync = new HiveSync({
      transport: {
        name: "test",
        pull: async () => [entry("incline friction")],
        push: async () => undefined,
      },
    });
    const merged = await sync.exchange([entry("incline friction")]);
    expect(merged).toHaveLength(1);
    expect(merged[0].votes).toBe(2);
  });
});

describe("httpTransport", () => {
  const endpoint = "https://example.test/hive/";

  it("normalises the endpoint and exposes it as its name", () => {
    expect(httpTransport(endpoint).name).toBe("https://example.test/hive");
  });

  it("batches pushes rather than POSTing one entry at a time", async () => {
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      return new Response(JSON.stringify({ version: 1, entries: [] }), { status: 200 });
    }) as typeof fetch;
    try {
      const t = httpTransport(endpoint, { batchSize: 2 });
      await t.push([entry("a"), entry("b"), entry("c")]);
      expect(calls).toEqual(["POST https://example.test/hive", "POST https://example.test/hive"]);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("sanitizes whatever the server sends back", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ entries: [entry("good"), { nope: true }] }), { status: 200 })) as typeof fetch;
    try {
      expect(await httpTransport(endpoint).pull()).toHaveLength(1);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("throws on a bad status, which HiveSync turns into a status message", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    try {
      await expect(httpTransport(endpoint).pull()).rejects.toThrow(/500/);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("makeEntry captures what the fly needs to learn it elsewhere", () => {
  it("stores the classifier's input, not just the words", () => {
    const e = makeEntry("A block slides down a frictionless incline", "newton", "taught");
    expect(e.topic).toBe("newton");
    expect(e.text.length).toBeGreaterThan(0);
    expect(e.units.length + e.keywords.length).toBeGreaterThan(0);
  });

  it("is a well-formed hive entry once merged", () => {
    const merged = mergeCorpora([makeEntry("orbital period of a satellite", "gravitation", "right")], []);
    expect(merged).toHaveLength(1);
    expect(merged[0].verdict).toBe("right");
  });
});
