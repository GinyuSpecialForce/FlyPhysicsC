/**
 * Problem types shared across the pipeline: raw problems, labeled problems,
 * and the structured trace the 3D visualization consumes.
 */
import type { Slot, Topic } from "./features";
import type { StageId } from "./stages";

/** Where a problem came from: hand-written exam, generator, or the user. */
export type Origin = "eval" | "synthetic" | "user";

/** A multiple-choice physics problem. */
export interface Choice {
  text: string;
}

export interface Problem {
  id: string;
  topic: Topic;
  text: string;
  choices: Choice[];
  /** index of correct choice (-1 for user problems, which have no key) */
  answer: number;
  /** optional worked solution shown after answering */
  solution?: string;
  origin: Origin;
}

/** The full pipeline result for one problem — the "thought record". */
export interface ThoughtRecord {
  problem: Problem;
  slots: Slot[];
  keywordHits: number[];
  /** per-topic probabilities from the mushroom bodies */
  topicProbs: Record<Topic, number>;
  /** topic with highest probability */
  predicted: Topic;
  correctTopic: Topic;
  /** confidence = predicted prob */
  confidence: number;
  /** which circuit was engaged */
  circuit: Topic;
  /** did the circuit produce the right choice? */
  answerIndex: number;
  correct: boolean;
  /** free-form answer the fly computed (user problems; null = it couldn't solve it) */
  computedAnswer?: string | null;
  /** per-stage traces for the timeline / 3D sync */
  stages: StageTrace[];
}

/** Trace for a single pipeline stage, consumed by UI + 3D. */
export interface StageTrace {
  id: StageId;
  label: string;
  region: string;
  /** short human-readable summary of what happened */
  summary: string;
  /** optional detail lines shown in the timeline */
  details: string[];
  /** normalized 0..1 activation level for the 3D glow */
  activation: number;
}

export type { Lesion, LesionType } from "./lesions";
