/**
 * Problem bank: synthetic problems from the topic generators, plus the
 * hand-written eval bank (loaded from JSON so educators can read/edit it).
 */
import type { Topic } from "./features";
import type { Problem } from "./types";
import type { Rng } from "./rng";
import { topicModule } from "./topics/index";

/** Generate a synthetic problem for a topic. */
export function generateProblem(topic: Topic, rng: Rng): Problem {
  const mod = topicModule(topic);
  const built = mod.generate(rng);
  return {
    id: `syn-${topic}-${Math.floor(rng.float() * 1e9)}`,
    topic,
    text: built.text,
    choices: built.choices.map((text) => ({ text })),
    answer: built.answer,
    solution: built.solution,
    origin: "synthetic",
  };
}

/** Generate a shuffled mix across all topics. */
export function generateMix(topics: readonly Topic[], n: number, rng: Rng): Problem[] {
  const out: Problem[] = [];
  for (let i = 0; i < n; i++) {
    out.push(generateProblem(topics[i % topics.length], rng));
  }
  return rng.shuffle(out);
}
