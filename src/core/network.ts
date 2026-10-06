/**
 * A small deterministic feed-forward network (1 hidden layer, tanh/sigmoid),
 * trained by plain gradient descent. Sized deliberately small — the point is
 * that a brain this tiny can still route AP problems.
 */
import { TOPIC_LIST, N_INPUT_FEATURES } from "./features";
import type { Rng } from "./rng";

const N_HIDDEN = 24;

export class Network {
  nIn: number;
  nHidden: number;
  nOut: number;

  /** weights[l][i][j]: layer l, from-unit i, to-unit j (l: 0 = in→hidden, 1 = hidden→out) */
  w0: number[][]; // [nIn][nHidden]
  b0: number[];   // [nHidden]
  w1: number[][]; // [nHidden][nOut]
  b1: number[];   // [nOut]

  constructor(rng: Rng) {
    this.nIn = N_INPUT_FEATURES;
    this.nHidden = N_HIDDEN;
    this.nOut = TOPIC_LIST.length;
    const s = 0.5 / Math.sqrt(this.nIn);
    this.w0 = matrix(this.nIn, this.nHidden, () => (rng.float() * 2 - 1) * s);
    this.b0 = new Array(this.nHidden).fill(0);
    const s1 = 0.5 / Math.sqrt(this.nHidden);
    this.w1 = matrix(this.nHidden, this.nOut, () => (rng.float() * 2 - 1) * s1);
    this.b1 = new Array(this.nOut).fill(0);
  }

  /** Forward pass → softmax topic probabilities. Also returns hidden activations for viz. */
  forward(input: number[]): { probs: number[]; hidden: number[] } {
    const hidden = new Array<number>(this.nHidden);
    for (let j = 0; j < this.nHidden; j++) {
      let sum = this.b0[j];
      for (let i = 0; i < this.nIn; i++) sum += this.w0[i][j] * input[i];
      hidden[j] = Math.tanh(sum);
    }
    const logits = new Array<number>(this.nOut);
    for (let k = 0; k < this.nOut; k++) {
      let sum = this.b1[k];
      for (let j = 0; j < this.nHidden; j++) sum += this.w1[j][k] * hidden[j];
      logits[k] = sum;
    }
    const max = Math.max(...logits);
    const exps = logits.map((l) => Math.exp(l - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map((e) => e / sum);
    return { probs, hidden };
  }

  /**
   * One SGD step on (input → topicIndex). Returns the loss.
   *
   * The gradients are folded straight into the weights rather than staged in
   * `gradW0`/`gradW1` matrices first. Each gradient element is consumed by
   * exactly one update, so materializing them cost two full matrix allocations
   * per sample (95×24 + 24×12 slots) for nothing. Order matters and is
   * preserved: `gradHidden` reads `w1`, so it is computed before `w1` moves.
   */
  trainStep(input: number[], topicIndex: number, lr: number): number {
    const { probs, hidden } = this.forward(input);
    // dL/dlogit for cross-entropy + softmax
    const dLogits = probs.slice();
    dLogits[topicIndex] -= 1;

    // in → hidden grads (reads the pre-update w1)
    const gradHidden = new Array<number>(this.nHidden);
    for (let j = 0; j < this.nHidden; j++) {
      let acc = 0;
      for (let k = 0; k < this.nOut; k++) acc += this.w1[j][k] * dLogits[k];
      gradHidden[j] = acc * (1 - hidden[j] * hidden[j]); // tanh'
    }

    // hidden → out update
    for (let k = 0; k < this.nOut; k++) {
      const g = dLogits[k];
      this.b1[k] -= lr * g;
      for (let j = 0; j < this.nHidden; j++) this.w1[j][k] -= lr * (g * hidden[j]);
    }

    // in → hidden update
    for (let j = 0; j < this.nHidden; j++) {
      const g = gradHidden[j];
      this.b0[j] -= lr * g;
      for (let i = 0; i < this.nIn; i++) this.w0[i][j] -= lr * (g * input[i]);
    }

    return -Math.log(Math.max(probs[topicIndex], 1e-12));
  }
}

function matrix(rows: number, cols: number, fill: () => number): number[][] {
  const m: number[][] = [];
  for (let i = 0; i < rows; i++) {
    const row = new Array<number>(cols);
    for (let j = 0; j < cols; j++) row[j] = fill();
    m.push(row);
  }
  return m;
}
