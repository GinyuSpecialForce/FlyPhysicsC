/**
 * Free-form input: turn any typed physics question into a Problem the brain
 * can run through its normal pipeline. There is no answer key — the fly
 * classifies, routes, computes, and states what it got (answer = -1).
 */
import { TOPIC_LIST } from "./features";
import type { Problem } from "./types";

/** Sentinel passed to solve() to re-run the last freeform record (idempotent desk re-render). */
export const FREEFORM_PROBLEM = {
  id: "__freeform__",
  topic: TOPIC_LIST[0],
  text: "",
  choices: [],
  answer: -1,
  origin: "user",
} as Problem;

export type FreeformProblem = Problem & { answer: -1 };

const MAX_CHARS = 600;

/** Parse typed text into a Problem. Throws when there's nothing to solve. */
export function buildFreeformProblem(text: string): FreeformProblem {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length === 0) throw new Error("Type a question first — the fly can't read a blank page.");
  return {
    id: `user-${Date.now().toString(36)}`,
    topic: TOPIC_LIST[0], // unknown; the mushroom bodies figure it out
    text: clean.length > MAX_CHARS ? `${clean.slice(0, MAX_CHARS)}…` : clean,
    choices: [],
    answer: -1,
    origin: "user",
  };
}

/** Shown under the input box; the fly's circuits handle all of these. */
export const FREEFORM_EXAMPLES: string[] = [
  "A 3 kg ball moves at 8 m/s. What is its kinetic energy?",
  "A 5 kg crate is pulled with 40 N across a frictionless surface. What is its acceleration?",
  "A 2 kg mass falls 4 m. How much energy does it gain?",
  "A 1500 kg car moves at 20 m/s. What is its momentum?",
  "A 0.5 kg block on a spring with k = 300 N/m is stretched 0.1 m. How much energy is stored?",
];
