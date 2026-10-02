/**
 * Training + evaluation. Trains the network on synthetic problems, then
 * measures honest accuracy on the hand-written eval bank. Also provides
 * per-lesion evaluation for the lesion lab.
 */
import { FlyBrain } from "./brain";
import { EVAL_BANK } from "./eval-bank";
import { generateProblem } from "./bank";
import { tokenize } from "./tokenizer";
import { buildFeatureVector, TOPIC_LIST } from "./features";
import { blendPriors, keywordPriors } from "./priors";
import type { Topic } from "./features";
import { Network } from "./network";
import { Rng } from "./rng";
import type { Problem, ThoughtRecord } from "./types";
import { LESIONS, type Lesion, type LesionType } from "./lesions";

export interface EpochSample {
  input: number[];
  topicIndex: number;
  text: string;
}

export interface TrainResult {
  network: Network;
  /** mean loss per epoch */
  losses: number[];
  /** eval accuracy per epoch (on the hand-written bank) */
  evalAccuracies: number[];
  /** final accuracy on the eval bank */
  finalEvalAccuracy: number;
  epochs: number;
}

export interface TrainOptions {
  /** learning rate (default 0.35) */
  lr?: number;
  /**
   * Called after every epoch with (epoch index, mean loss, eval accuracy).
   * Lets the UI train one real network incrementally instead of throwing
   * epochs away.
   */
  onEpoch?: (epoch: number, loss: number, evalAccuracy: number) => void;
}

export interface EvalResult {
  accuracy: number;
  correct: number;
  total: number;
  /** per-topic accuracy */
  perTopic: Record<Topic, { correct: number; total: number }>;
  records: ThoughtRecord[];
}

/** Build training samples from synthetic problems. */
function makeSamples(topics: readonly Topic[], n: number, rng: Rng): EpochSample[] {
  const out: EpochSample[] = [];
  for (let i = 0; i < n; i++) {
    const topic = topics[i % topics.length];
    const problem = generateProblem(topic, rng);
    const { slots, keywordHits } = tokenize(problem.text);
    const input = buildFeatureVector(slots, keywordHits);
    out.push({ input, topicIndex: TOPIC_LIST.indexOf(topic), text: problem.text });
  }
  return out;
}

/**
 * Train from scratch. Deterministic for a given seed. Samples are regenerated
 * each epoch, so the network sees fresh problems every pass. The network
 * trains on the residual error after the innate keyword priors, so it learns
 * what the priors can't already explain.
 */
export function trainNetwork(seed: number, epochs: number, samplesPerEpoch = 600, opts: TrainOptions = {}): TrainResult {
  const lr = opts.lr ?? 0.35;
  const rng = new Rng(seed);
  const topics = TOPIC_LIST;
  const network = new Network(rng);
  const losses: number[] = [];
  const evalAccuracies: number[] = [];

  for (let epoch = 0; epoch < epochs; epoch++) {
    const samples = makeSamples(topics, samplesPerEpoch, rng);
    let totalLoss = 0;
    for (const s of samples) {
      const priors = keywordPriors(s.text, TOPIC_LIST);
      const biasedProbs = blendPriors(network.forward(s.input).probs, priors);
      // go easy where the priors already get it right
      const stepLr = lr * (biasedProbs[s.topicIndex] > 0.5 ? 0.35 : 1);
      totalLoss += network.trainStep(s.input, s.topicIndex, stepLr);
    }
    const meanLoss = totalLoss / samples.length;
    const acc = evaluate(network).accuracy;
    losses.push(meanLoss);
    evalAccuracies.push(acc);
    opts.onEpoch?.(epoch, meanLoss, acc);
  }

  return {
    network,
    losses,
    evalAccuracies,
    finalEvalAccuracy: evalAccuracies[evalAccuracies.length - 1],
    epochs,
  };
}

/** Evaluate on the hand-written eval bank. */
export function evaluate(network: Network, lesion: Lesion = { type: "none" }): EvalResult {
  const brain = new FlyBrain(network, lesion);
  const records = EVAL_BANK.map((p) => brain.solve(p));
  return summarize(records);
}

/** Evaluate on fresh synthetic problems (never trained on these exact ones). */
export function evaluateSynthetic(network: Network, n: number, rng: Rng, lesion: Lesion = { type: "none" }): EvalResult {
  const brain = new FlyBrain(network, lesion);
  const problems: Problem[] = [];
  for (let i = 0; i < n; i++) {
    const topic = TOPIC_LIST[i % TOPIC_LIST.length];
    problems.push(generateProblem(topic, rng));
  }
  return summarize(problems.map((p) => brain.solve(p)));
}

function summarize(records: ThoughtRecord[]): EvalResult {
  const correct = records.filter((r) => r.correct).length;
  const perTopic = {} as Record<Topic, { correct: number; total: number }>;
  for (const t of TOPIC_LIST) perTopic[t] = { correct: 0, total: 0 };
  for (const r of records) {
    perTopic[r.correctTopic].total++;
    if (r.correct) perTopic[r.correctTopic].correct++;
  }
  return {
    accuracy: records.length ? correct / records.length : 0,
    correct,
    total: records.length,
    perTopic,
    records,
  };
}

/** Evaluate every lesion in the registry — powers the lesion lab. */
export function evaluateAllLesions(network: Network): Record<LesionType, EvalResult> {
  const out = {} as Record<LesionType, EvalResult>;
  for (const info of LESIONS) {
    out[info.type] = evaluate(network, { type: info.type });
  }
  return out;
}
