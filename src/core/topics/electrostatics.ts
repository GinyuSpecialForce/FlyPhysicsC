/**
 * Electrostatics — Coulomb's law, point-charge fields, qE force with
 * direction phrase ("opposite the field" for negative charges).
 */
import { buildChoices } from "./distractors";
import { takeAll } from "../extract";
import type { SolveCtx } from "../extract";
import { K_E } from "../constants";
import type { Rng } from "../rng";
import type { BuiltProblem } from "./distractors";

export function generate(rng: Rng): BuiltProblem {
  const q1 = rng.pick([1, 2, 3, 5]) * 1e-6;
  const q2 = rng.pick([1, 2, 3, 4]) * 1e-6;
  const r = rng.pick([0.02, 0.03, 0.05, 0.1]);
  const F = (K_E * q1 * q2) / (r * r);
  const scenario = `Two point charges, ${q1 * 1e6} μC and ${q2 * 1e6} μC, sit ${(r * 100).toFixed(0)} cm apart. What is the magnitude of the force between them?`;
  const sol = `F = kq₁q₂/r² = 8.99×10⁹·(${q1 * 1e6}μC)(${q2 * 1e6}μC)/(${r * 100}cm)²`;
  return buildChoices(
    { value: F, unit: "N" },
    [F * 2, F / 2, (K_E * q1 * q2) / r, (K_E * (q1 + q2)) / (r * r)],
    rng,
    scenario,
    sol,
  );
}

export function solve(ctx: SolveCtx): {
  value: number;
  unit: string;
  displayScale?: number;
  displaySuffix?: string;
  concept?: string;
} {
  const charges = takeAll(ctx.slots, "charge");
  const lengths = takeAll(ctx.slots, "length");
  const fields = takeAll(ctx.slots, "field-e");
  const t = ctx.text.toLowerCase();

  // inverse-square concept questions ("distance triples → 1/9")
  if (/triples/.test(t)) {
    return { value: NaN, unit: "concept", concept: "1/9 of original" };
  }
  if (/doubles/.test(t)) {
    return { value: NaN, unit: "concept", concept: "1/4 of original" };
  }
  // attract/repel concept question
  if (/attracted or repelled/.test(t) && charges.length >= 2) {
    const opposite = charges[0] * charges[1] < 0;
    const F = (K_E * Math.abs(charges[0] * charges[1])) / (lengths[0] * lengths[0]);
    const near = pickNearestPhrase(F);
    return {
      value: NaN,
      unit: "concept",
      concept: `${opposite ? "Attracted" : "Repelled"}, ${near}`,
    };
  }
  // force direction on a placed charge: F = qE
  if (/placed in|is placed/.test(t) && charges.length && fields.length) {
    const F = Math.abs(charges[0] * fields[0]);
    const dir = charges[0] < 0 ? " opposite the field" : " along the field";
    return { value: F, unit: "N", displaySuffix: dir };
  }
  // E = kq/r²
  if (/electric field/.test(t) && charges.length && lengths.length) {
    return { value: (K_E * charges[0]) / (lengths[0] * lengths[0]), unit: "N/C" };
  }
  // F = kq₁q₂/r² (a single stated charge implies two identical charges)
  if (charges.length && lengths.length) {
    const q1 = charges[0];
    const q2 = charges.length >= 2 ? charges[1] : charges[0];
    return {
      value: (K_E * Math.abs(q1 * q2)) / (lengths[0] * lengths[0]),
      unit: "N",
    };
  }
  return { value: NaN, unit: "N" };
}

function pickNearestPhrase(F: number): string {
  const options: [number, string][] = [
    [0.9, "0.9 N"],
    [1.8, "1.8 N"],
    [0.45, "0.45 N"],
  ];
  let best = options[0];
  let bestErr = Infinity;
  for (const [v, s] of options) {
    const err = Math.abs(v - F);
    if (err < bestErr) {
      bestErr = err;
      best = [v, s];
    }
  }
  return best[1];
}

export const electrostatics = { name: "electrostatics", generate, solve };
