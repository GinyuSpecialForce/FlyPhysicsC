/**
 * This device's memory. Without this, closing the tab throws away everything
 * the fly was taught — which is the first half of "remembers on any computer"
 * and the half that needs no infrastructure at all.
 *
 * The Storage is injected rather than reached for globally so the whole thing
 * is testable in a node test env (this project has no jsdom), and so a
 * browser with localStorage disabled degrades to a working in-memory app
 * instead of a crash on boot.
 */
import { dedupe, sanitizeCorpus, toCorpus, fromCorpus, type HiveEntry } from "./corpus";
import { decodeSnapshot, encodeWeights, type BrainSnapshot } from "./serialize";
import type { Network } from "./network";

/** The slice of the Web Storage API this module needs. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const NS = "fly-physics-c/v1";
export const KEYS = {
  corpus: `${NS}/corpus`,
  learned: `${NS}/learnedProblems`,
  weights: `${NS}/weights`,
  install: `${NS}/install`,
} as const;

function randomId(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** localStorage if it is actually usable, otherwise null (app still runs). */
export function browserStorage(): KeyValueStore | null {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const probe = `${NS}/probe`;
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null; // private mode, disabled cookies, sandboxed iframe
  }
}

/** What a locally-trained weight snapshot records about its own provenance. */
export interface LocalWeightMeta {
  seed: number;
  epochs: number;
  samples: number;
  evalAccuracy: number;
}

export class HiveStore {
  /** null storage = in-memory only; reads and writes are still correct */
  constructor(private storage: KeyValueStore | null) {}

  get persistent(): boolean {
    return this.storage !== null;
  }

  /**
   * An anonymous id for this browser, used only to tell "the same person
   * again" from "another person" when counting votes. It carries nothing else
   * and identifies nobody.
   */
  installId(): string {
    const existing = this.readJson(KEYS.install);
    if (typeof existing === "string" && existing.length > 0) return existing;
    const fresh = randomId();
    if (this.persistent) this.write(KEYS.install, JSON.stringify(fresh));
    return fresh;
  }

  // ── the shared corpus this device knows about ──

  loadEntries(): HiveEntry[] {
    return fromCorpus(this.readJson(KEYS.corpus));
  }

  saveEntries(entries: readonly HiveEntry[]): boolean {
    return this.write(KEYS.corpus, JSON.stringify(toCorpus(entries)));
  }

  /** Merge new teaches into what is already here, and return the whole set. */
  addEntries(entries: readonly HiveEntry[]): HiveEntry[] {
    const merged = dedupe([...this.loadEntries(), ...entries]);
    this.saveEntries(merged);
    return merged;
  }

  // ── which problems already taught themselves from their answer key ──

  loadLearned(): string[] {
    const list = this.readJson(KEYS.learned);
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string").slice(0, 5000) : [];
  }

  saveLearned(ids: Iterable<string>): boolean {
    return this.write(KEYS.learned, JSON.stringify([...new Set(ids)].slice(0, 5000)));
  }

  // ── this device's own learning, on top of the shipped brain ──
  //
  // Storing the weights is what makes a reload keep the extra learning this
  // machine did. They are tagged with the digest of the brain they started
  // from: if the site ships a new brain, these are stale and are dropped —
  // the teaches survive, and get replayed onto the new brain instead.

  loadWeights(baseDigest: string): Network | null {
    const parsed = this.readJson(KEYS.weights);
    if (!parsed || typeof parsed !== "object") return null;
    if ((parsed as { base?: unknown }).base !== baseDigest) return null;
    const decoded = decodeSnapshot((parsed as { snapshot?: unknown }).snapshot);
    return decoded?.network ?? null;
  }

  saveWeights(network: Network, baseDigest: string, meta: LocalWeightMeta): boolean {
    const snapshot: BrainSnapshot = {
      version: 1,
      seed: meta.seed,
      epochs: meta.epochs,
      samples: meta.samples,
      nIn: network.nIn,
      nOut: network.nOut,
      evalAccuracy: meta.evalAccuracy,
      teaches: 0,
      bakedKeys: [],
      weights: encodeWeights(network),
    };
    return this.write(KEYS.weights, JSON.stringify({ base: baseDigest, snapshot }));
  }

  // ── the escape hatch ──

  /** Erase everything this device knows. Shared corpus entries too. */
  forget(): void {
    if (!this.storage) return;
    try {
      for (const key of Object.values(KEYS)) this.storage.removeItem(key);
    } catch {
      /* nothing useful to do — the data is already unreachable */
    }
  }

  // ── storage plumbing that never throws ──

  /** Parsed JSON, or null. Corrupt data is never worth a broken boot. */
  private readJson(key: string): unknown {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): boolean {
    if (!this.storage) return false;
    try {
      this.storage.setItem(key, value);
      return true;
    } catch {
      // quota exceeded: the fly keeps working in memory, we just stop
      // promising it will survive the next reload
      return false;
    }
  }
}

export { sanitizeCorpus };
