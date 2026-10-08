/**
 * Shipping the trained brain — the thing that makes a visitor's fly start
 * already knowing what everyone else taught it.
 *
 * All 2,604 weights fit in a ~10 KB base64 blob, which is small enough to
 * fetch in one request and large enough to matter: it replaces the 3,600
 * gradient steps every browser used to run on every page load.
 *
 * A snapshot is a FAST-START, not the source of truth. The corpus is. The
 * snapshot header records which corpus entries are already baked in, so a
 * client replays only what is new to it and still converges on the same
 * weights a rebuild would produce.
 */
import { N_INPUT_FEATURES, TOPIC_LIST } from "./features";
import { Rng } from "./rng";
import { Network } from "./network";
import { keyHash } from "./corpus";
import type { HiveEntry } from "./corpus";

export const SNAPSHOT_VERSION = 1 as const;

export interface BrainSnapshot {
  version: typeof SNAPSHOT_VERSION;
  /** the seed the synthetic pre-training used, for reproducibility */
  seed: number;
  epochs: number;
  samples: number;
  nIn: number;
  nOut: number;
  /** held-out accuracy on the hand-written eval bank at build time */
  evalAccuracy: number;
  /** number of shared teaches folded into these weights */
  teaches: number;
  /** keyHash of every corpus entry already replayed into these weights */
  bakedKeys: string[];
  weights: string;
}

/** Flat [w0…, b0…, w1…, b1…] in Float32, base64'd. */
export function encodeWeights(network: Network): string {
  const n = network.w0.length * network.nHidden + network.b0.length +
    network.w1.length * network.nOut + network.b1.length;
  const buf = new Float32Array(n);
  let k = 0;
  for (let i = 0; i < network.w0.length; i++) for (let j = 0; j < network.nHidden; j++) buf[k++] = network.w0[i][j];
  for (let j = 0; j < network.b0.length; j++) buf[k++] = network.b0[j];
  for (let j = 0; j < network.w1.length; j++) for (let o = 0; o < network.nOut; o++) buf[k++] = network.w1[j][o];
  for (let o = 0; o < network.b1.length; o++) buf[k++] = network.b1[o];
  return toBase64(new Uint8Array(buf.buffer));
}

export function buildSnapshot(opts: {
  network: Network;
  seed: number;
  epochs: number;
  samples: number;
  evalAccuracy: number;
  entries: readonly HiveEntry[];
}): BrainSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    seed: opts.seed,
    epochs: opts.epochs,
    samples: opts.samples,
    nIn: opts.network.nIn,
    nOut: opts.network.nOut,
    evalAccuracy: Math.round(opts.evalAccuracy * 1e4) / 1e4,
    teaches: opts.entries.length,
    bakedKeys: opts.entries.map((e) => keyHash(e)),
    weights: encodeWeights(opts.network),
  };
}

export interface DecodedBrain {
  network: Network;
  bakedKeys: Set<string>;
  evalAccuracy: number;
  teaches: number;
}

/**
 * Rebuild a network from a snapshot. Returns null for anything that does not
 * match the CURRENT architecture — a stale snapshot is skipped, never crashed
 * into, because the feature vector is a moving target and old weights mean
 * nothing. Callers fall back to training in that case.
 */
export function decodeSnapshot(raw: unknown): DecodedBrain | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<BrainSnapshot>;
  if (s.version !== SNAPSHOT_VERSION) return null;
  if (s.nIn !== N_INPUT_FEATURES || s.nOut !== TOPIC_LIST.length) return null;
  if (typeof s.weights !== "string" || s.weights.length === 0) return null;
  if (!Array.isArray(s.bakedKeys)) return null;

  const network = new Network(new Rng(1)); // shape only; weights are replaced below
  const expected =
    network.w0.length * network.nHidden + network.b0.length +
    network.w1.length * network.nOut + network.b1.length;
  const floats = fromBase64(s.weights);
  if (floats.length !== expected) return null;
  const flat = new Float32Array(expected);
  for (let i = 0; i < expected; i++) flat[i] = floats[i];
  if (flat.some((v) => !Number.isFinite(v))) return null;

  let k = 0;
  for (let i = 0; i < network.w0.length; i++) for (let j = 0; j < network.nHidden; j++) network.w0[i][j] = flat[k++];
  for (let j = 0; j < network.b0.length; j++) network.b0[j] = flat[k++];
  for (let j = 0; j < network.w1.length; j++) for (let o = 0; o < network.nOut; o++) network.w1[j][o] = flat[k++];
  for (let o = 0; o < network.b1.length; o++) network.b1[o] = flat[k++];

  return {
    network,
    bakedKeys: new Set(s.bakedKeys.filter((k): k is string => typeof k === "string")),
    evalAccuracy: Number.isFinite(s.evalAccuracy) ? Number(s.evalAccuracy) : 0,
    teaches: Number.isFinite(s.teaches) ? Number(s.teaches) : 0,
  };
}

// ── base64 (btoa/atob are global in browsers and in Node 16+, so the
//    build scripts under vite-node use this exact same path) ──

function toBase64(bytes: Uint8Array): string {
  let s = "";
  // chunked: spreading a whole 10 KB array into fromCharCode blows the stack
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function fromBase64(text: string): Float32Array {
  let bin: string;
  try {
    bin = atob(text);
  } catch {
    // a truncated or hand-edited brain.json must be skipped, not crash the boot
    return new Float32Array(0);
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  // byteLength must be a multiple of 4 for a Float32Array view
  const usable = bytes.byteLength - (bytes.byteLength % 4);
  return new Float32Array(bytes.buffer, bytes.byteOffset, usable / 4);
}
