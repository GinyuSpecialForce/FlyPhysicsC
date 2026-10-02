/**
 * Topic registry: wires each topic's generator and solver circuit together.
 * The brain routes to these; the bank draws from these.
 */
import type { Topic } from "../features";
import type { Rng } from "../rng";
import type { BuiltProblem } from "./distractors";
import type { SolveCtx } from "../extract";
import * as kinematics from "./kinematics";
import * as newton from "./newton";
import * as energy from "./energy";
import * as momentum from "./momentum";
import * as rotation from "./rotation";
import * as shm from "./shm";
import * as gravitation from "./gravitation";
import * as electrostatics from "./electrostatics";
import * as capacitors from "./capacitors";
import * as circuits from "./circuits";
import * as magnetism from "./magnetism";
import * as induction from "./induction";

/** What a solver circuit returns: a computed value, or a concept phrase. */
export interface SolveResult {
  /** computed SI value (NaN for concept answers) */
  value: number;
  /** unit of the computed value, or "concept" */
  unit: string;
  /** divide the computed value by this before display/matching (μC → 1e-6) */
  displayScale?: number;
  /** directional phrase appended to the answer ("opposite the field") */
  displaySuffix?: string;
  /** conceptual answer phrase — matched against choice text */
  concept?: string;
}

export interface TopicModule {
  generate(rng: Rng): BuiltProblem;
  solve(ctx: SolveCtx): SolveResult;
}

const REGISTRY: Record<Topic, TopicModule> = {
  kinematics,
  newton,
  energy,
  momentum,
  rotation,
  shm,
  gravitation,
  electrostatics,
  capacitors,
  circuits,
  magnetism,
  induction,
};

export function topicModule(topic: Topic): TopicModule {
  return REGISTRY[topic];
}
