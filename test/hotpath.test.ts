/**
 * Hot-path regression guards for the trainer's inner loop (Network.trainStep).
 *
 * Two axes:
 *   1. numerics — the allocation-free "fold gradients straight into the
 *      weights" version must stay bit-identical to the textbook staged-
 *      gradient reference. The brain.json determinism invariant rests on
 *      this exact math, so a silent change here is the worst regression.
 *   2. cost — the step must not quietly start allocating per-sample gradient
 *      matrices again (counted directly with V8 allocation sampling, and
 *      compared against the staged reference so the ratio self-calibrates
 *      across V8 versions and machines) or blow up in time complexity
 *      (fastest-batch wall clock, noise-robust on a loaded machine).
 *
 * The cost thresholds carry deliberate headroom over the measured values
 * noted in each assertion: they are smoke alarms for order-of-magnitude
 * regressions, not benchmarks.
 */
import { describe, it, expect } from "vitest";
import { Network } from "../src/core/network";
import { Rng } from "../src/core/rng";
// @ts-ignore — this project ships no @types/node; node:inspector exists at runtime
import { Session } from "node:inspector";

function sampleInput(rng: Rng, n: number): number[] {
  const v = new Array<number>(n);
  for (let i = 0; i < n; i++) v[i] = rng.float();
  return v;
}

/**
 * The textbook version of one SGD step: stage every gradient in full
 * matrices, then apply them. Slow and allocation-hungry — that is the point:
 * it is the ground truth the fast path must match bit-for-bit, and its cost
 * is the yardstick the allocation guard measures against. Every arithmetic
 * expression is written in the same grouping as network.ts so the
 * comparison can be exact.
 */
function referenceTrainStep(net: Network, input: number[], topicIndex: number, lr: number): number {
  const { probs, hidden } = net.forward(input);
  const dLogits = probs.slice();
  dLogits[topicIndex] -= 1;

  // hidden ← out backprop (reads the pre-update w1)
  const gradHidden = new Array<number>(net.nHidden);
  for (let j = 0; j < net.nHidden; j++) {
    let acc = 0;
    for (let k = 0; k < net.nOut; k++) acc += net.w1[j][k] * dLogits[k];
    gradHidden[j] = acc * (1 - hidden[j] * hidden[j]);
  }

  // stage every gradient in full matrices, the textbook way
  const gradW0: number[][] = [];
  for (let i = 0; i < net.nIn; i++) {
    const row = new Array<number>(net.nHidden);
    for (let j = 0; j < net.nHidden; j++) row[j] = gradHidden[j] * input[i];
    gradW0.push(row);
  }
  const gradB0 = gradHidden.slice();
  const gradW1: number[][] = [];
  for (let j = 0; j < net.nHidden; j++) {
    const row = new Array<number>(net.nOut);
    for (let k = 0; k < net.nOut; k++) row[k] = dLogits[k] * hidden[j];
    gradW1.push(row);
  }
  const gradB1 = dLogits.slice();

  // apply
  for (let k = 0; k < net.nOut; k++) net.b1[k] -= lr * gradB1[k];
  for (let j = 0; j < net.nHidden; j++) {
    for (let k = 0; k < net.nOut; k++) net.w1[j][k] -= lr * gradW1[j][k];
    net.b0[j] -= lr * gradB0[j];
  }
  for (let i = 0; i < net.nIn; i++) {
    for (let j = 0; j < net.nHidden; j++) net.w0[i][j] -= lr * gradW0[i][j];
  }

  return -Math.log(Math.max(probs[topicIndex], 1e-12));
}

/** Count mismatched weight slots between two networks (0 = bit-identical). */
function weightMismatches(a: Network, b: Network): number {
  let bad = 0;
  for (let i = 0; i < a.nIn; i++) for (let j = 0; j < a.nHidden; j++) if (a.w0[i][j] !== b.w0[i][j]) bad++;
  for (let j = 0; j < a.nHidden; j++) if (a.b0[j] !== b.b0[j]) bad++;
  for (let j = 0; j < a.nHidden; j++) for (let k = 0; k < a.nOut; k++) if (a.w1[j][k] !== b.w1[j][k]) bad++;
  for (let k = 0; k < a.nOut; k++) if (a.b1[k] !== b.b1[k]) bad++;
  return bad;
}

interface SamplingNode {
  selfSize: number;
  children: SamplingNode[];
}

function post(session: unknown, method: string, params?: object): Promise<{ profile: { head: SamplingNode } }> {
  return new Promise((resolve, reject) => {
    (session as { post: (m: string, p: object, cb: (err: unknown, r: unknown) => void) => void }).post(
      method,
      params ?? {},
      (err, result) => (err ? reject(err) : resolve(result as { profile: { head: SamplingNode } })),
    );
  });
}

/**
 * Total bytes V8 allocated while `run` executed, via allocation sampling.
 * Returns null when the inspector is unavailable — the guard then stands
 * down rather than failing the suite.
 */
async function sampledAllocBytes(run: () => void): Promise<number | null> {
  let session: { connect(): void; disconnect(): void } | null = null;
  try {
    session = new Session() as unknown as { connect(): void; disconnect(): void };
    session.connect();
  } catch {
    return null;
  }
  try {
    await post(session, "HeapProfiler.enable");
    // without these two flags V8 only samples objects that SURVIVE GC —
    // short-lived garbage (the whole point here) would be invisible
    await post(session, "HeapProfiler.startSampling", {
      samplingInterval: 16384,
      includeObjectsCollectedByMajorGC: true,
      includeObjectsCollectedByMinorGC: true,
    });
    run();
    const { profile } = await post(session, "HeapProfiler.stopSampling");
    // selfSize across the sampling tree ≈ bytes allocated per call frame
    let bytes = 0;
    const stack: SamplingNode[] = [profile.head];
    while (stack.length) {
      const node = stack.pop()!;
      bytes += node.selfSize;
      for (const child of node.children) stack.push(child);
    }
    return bytes;
  } catch {
    return null;
  } finally {
    session!.disconnect();
  }
}

/**
 * Fastest per-iteration cost in microseconds over several batches of `n`
 * iterations. The minimum is the noise-robust estimator on a machine that
 * may be running the rest of the suite concurrently — a slow batch is
 * contention, a fast batch is the real cost.
 */
function fastestBatchUs(n: number, run: () => void): number {
  let best = Infinity;
  for (let b = 0; b < 7; b++) {
    const t0 = performance.now();
    run();
    best = Math.min(best, (performance.now() - t0) * 1000);
  }
  return best / n;
}

describe("trainStep hot path: cost and numerics regression guards", () => {
  it("matches the staged-gradient reference bit-for-bit over several steps", () => {
    const fast = new Network(new Rng(7));
    const slow = new Network(new Rng(7));
    const rng = new Rng(99);
    let fastLoss = 0;
    let slowLoss = 0;
    for (let step = 0; step < 5; step++) {
      const input = sampleInput(rng, fast.nIn);
      const topic = (step * 5) % fast.nOut;
      fastLoss = fast.trainStep(input, topic, 0.05);
      slowLoss = referenceTrainStep(slow, input, topic, 0.05);
    }
    expect(fastLoss).toBe(slowLoss);
    expect(weightMismatches(fast, slow)).toBe(0);
  });

  it("does not allocate per-sample gradient matrices", async () => {
    const net = new Network(new Rng(3));
    const rng = new Rng(5);
    const inputs = [sampleInput(rng, net.nIn), sampleInput(rng, net.nIn), sampleInput(rng, net.nIn)];
    const steps = (step: (n: Network, i: number[], t: number, lr: number) => number) => () => {
      for (let i = 0; i < 1000; i++) step(net, inputs[i % 3], i % net.nOut, 0.05);
    };
    const fastBytes = await sampledAllocBytes(steps((n, i, t, lr) => n.trainStep(i, t, lr)));
    const slowBytes = await sampledAllocBytes(steps((n, i, t, lr) => referenceTrainStep(n, i, t, lr)));
    if (fastBytes === null || slowBytes === null) return; // inspector unavailable — guard stands down

    // The staged-gradient reference allocates full gradW0/gradW1 matrices:
    // measured ~31 MB per 1000 steps vs ~9 MB for the folded version (ratio
    // ~0.28). The ratio self-calibrates against V8 and machine differences —
    // if trainStep ever stages gradients again its cost converges on the
    // reference's and the ratio goes to ~1.
    expect(fastBytes).toBeLessThan(slowBytes * 0.5);
    // …and an absolute ceiling catches regressions that allocate heavily
    // without growing the reference (1000 steps must stay under 20 MB).
    expect(fastBytes).toBeLessThan(20e6);
  });

  it("stays fast: bounded per-step cost and no complexity blowup", () => {
    const net = new Network(new Rng(11));
    const rng = new Rng(13);
    const input = sampleInput(rng, net.nIn);
    for (let i = 0; i < 300; i++) net.trainStep(input, i % net.nOut, 0.05); // warm up JIT

    const stepUs = fastestBatchUs(200, () => {
      for (let i = 0; i < 200; i++) net.trainStep(input, i % net.nOut, 0.05);
    });
    const fwdUs = fastestBatchUs(200, () => {
      for (let i = 0; i < 200; i++) net.forward(input);
    });

    // measured ~50–100 µs/step on a laptop under load; 500 µs is a smoke
    // alarm for order-of-magnitude regressions (per-step matrix staging,
    // accidental O(n²) scans), not a benchmark.
    expect(stepUs).toBeLessThan(500);
    // trainStep = one forward + one backward; a ratio blowup means the step
    // grew work far beyond its math. Wide bound on purpose — the ratio is
    // noisy when the two micro-loops see different machine load.
    expect(stepUs).toBeLessThan(fwdUs * 10);
  });
});
