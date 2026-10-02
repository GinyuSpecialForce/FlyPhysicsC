/**
 * Choice construction for generated problems: one correct answer plus
 * physics-literate distractors (sign errors, factor-of-2 errors, formula
 * variants), deduplicated at display precision and shuffled.
 */
import { fmt } from "../format";
import type { Rng } from "../rng";

export interface Answer {
  value: number;
  unit: string;
}

export interface BuiltProblem {
  text: string;
  choices: string[];
  answer: number; // index into choices
  solution: string;
}

/** Key for dedupe: the formatted answer text. */
function key(value: number, unit: string): string {
  return `${fmt(value)} ${unit}`;
}

/**
 * Build a multiple-choice problem from a correct answer and candidate
 * distractor values (in preference order). Ensures exactly one correct
 * choice and 5 unique choices.
 */
export function buildChoices(
  correct: Answer,
  distractorValues: number[],
  rng: Rng,
  scenario: string,
  solution: string,
): BuiltProblem {
  const used = new Set<string>([key(correct.value, correct.unit)]);
  const texts: string[] = [key(correct.value, correct.unit)];

  for (const dv of distractorValues) {
    if (texts.length >= 5) break;
    const k = key(dv, correct.unit);
    if (used.has(k)) continue;
    // reject distractors numerically equal to the answer at display precision
    if (Math.abs(dv - correct.value) <= Math.abs(correct.value) * 1e-3) continue;
    used.add(k);
    texts.push(k);
  }
  // fill any remaining slots with perturbations (guard against degenerate
  // correct values: 0, Infinity, NaN would spin forever otherwise)
  const base =
    Number.isFinite(correct.value) && correct.value !== 0 ? correct.value : 1;
  let bump = 1.7;
  while (texts.length < 5 && bump < 200) {
    const dv = base * bump;
    const k = key(dv, correct.unit);
    if (!used.has(k)) {
      used.add(k);
      texts.push(k);
    }
    bump += 0.9;
  }

  // shuffle, tracking the correct index
  const idx = [0, 1, 2, 3, 4];
  const shuffled = rng.shuffle(idx);
  const choices = shuffled.map((i) => texts[i]);
  const answer = shuffled.indexOf(0);

  const letter = "ABCDE"[answer];
  return {
    text: scenario,
    choices,
    answer,
    solution: `${solution} → ${texts[0]} (choice ${letter})`,
  };
}
