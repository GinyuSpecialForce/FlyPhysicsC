import { describe, it, expect } from "vitest";
import { trainNetwork } from "../src/core/train";
import { FlyBrain } from "../src/core/brain";
import { parseChoiceNumber } from "../src/core/format";
import { PROBLEM_BANK, type BankCase } from "./problem-bank";

/**
 * The fly prints some answers in a prefixed unit ("6000 μC"); the bank keeps
 * everything in SI, so a printed answer is scaled back before comparing.
 */
const PREFIXED: Record<string, [scale: number, unit: string]> = {
  "μC": [1e-6, "C"],
  "nC": [1e-9, "C"],
  "μF": [1e-6, "F"],
  "pF": [1e-12, "F"],
  "mA": [1e-3, "A"],
  "V/m": [1, "N/C"],
};

/** Split "1.20×10⁻⁴ T" into its SI value and unit. */
function readAnswer(answer: string): { value: number; unit: string } {
  const m = answer.match(/^(-?[\d.]+(?:×10[⁻⁰¹²³⁴⁵⁶⁷⁸⁹⁺]+)?)\s*(\S+)/);
  if (!m) return { value: NaN, unit: "" };
  const [scale, unit] = PREFIXED[m[2]] ?? [1, m[2]];
  return { value: parseChoiceNumber(m[1]) * scale, unit };
}

function grade(brain: FlyBrain, [text, value, unit]: BankCase): string | null {
  const answer = brain.solveFreeform(text).computedAnswer;
  if (answer == null) return `no answer (wanted ${value} ${unit}) — ${text}`;
  const got = readAnswer(answer);
  // answers are printed to three significant figures
  const close = Math.abs(got.value - value) <= Math.abs(value) * 0.015;
  if (close && got.unit === unit) return null;
  return `got ${answer} (wanted ${value} ${unit}) — ${text}`;
}

describe("problem bank: textbook questions with no choices to lean on", () => {
  const { network } = trainNetwork(1337, 6);

  for (const [topic, cases] of Object.entries(PROBLEM_BANK)) {
    it(`answers every ${topic} question`, () => {
      const brain = new FlyBrain(network);
      const misses = cases.map((c) => grade(brain, c)).filter((m): m is string => m !== null);
      // joined so a failure lists every missed question in full
      expect(misses.join("\n"), `${misses.length} of ${cases.length} missed`).toBe("");
    });
  }
});
