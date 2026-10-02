/**
 * SHM — mass–spring (T = 2π√(m/k)) and pendulum (T = 2π√(L/g)), plus
 * period↔frequency conversion.
 */
import { buildChoices } from "./distractors";
import { takeAll, omegaOf } from "../extract";
import type { SolveCtx } from "../extract";
import type { SolveResult } from "./index";
import { G_ACC } from "../constants";
import type { Rng } from "../rng";
import type { BuiltProblem } from "./distractors";

export function generate(rng: Rng): BuiltProblem {
  const kind = rng.int(0, 1);

  if (kind === 0) {
    const m = rng.pick([0.2, 0.5, 1, 1.5, 2]);
    const k = rng.pick([10, 20, 50, 100, 200]);
    const T = 2 * Math.PI * Math.sqrt(m / k);
    const scenario = `A ${m} kg mass on a spring with k = ${k} N/m oscillates. What is the period?`;
    const sol = `T = 2π√(m/k) = 2π√(${m}/${k})`;
    return buildChoices(
      { value: T, unit: "s" },
      [2 * Math.PI * Math.sqrt(k / m), Math.sqrt(m / k), T / 2, 2 * T],
      rng,
      scenario,
      sol,
    );
  }

  const L = rng.pick([0.25, 0.5, 0.75, 1, 1.5, 2]);
  const T = 2 * Math.PI * Math.sqrt(L / G_ACC);
  const scenario = `A simple pendulum has length ${L} m. What is its period on Earth?`;
  const sol = `T = 2π√(L/g) = 2π√(${L}/9.8)`;
  return buildChoices(
    { value: T, unit: "s" },
    [Math.sqrt(L / G_ACC), 2 * Math.PI * Math.sqrt(G_ACC / L), T / 2, 2 * T],
    rng,
    scenario,
    sol,
  );
}

export function solve(ctx: SolveCtx): SolveResult {
  const masses = takeAll(ctx.slots, "mass");
  const lengths = takeAll(ctx.slots, "length");
  const springs = takeAll(ctx.slots, "spring-k");
  const times = takeAll(ctx.slots, "time");
  const freqs = takeAll(ctx.slots, "frequency");
  const t = ctx.text.toLowerCase();

  // conceptual: max speed location
  if (/where is the speed|speed .* greatest/.test(t)) {
    return { value: NaN, unit: "concept", concept: "At equilibrium" };
  }
  // conical pendulum: a = g(r/h) from the force triangle, T = 2π√(h/g)
  if (/conical/.test(t)) {
    if (/period|how long/.test(t)) return { value: NaN, unit: "concept", concept: "T = 2π√(h/g)" };
    return { value: NaN, unit: "concept", concept: "a = g·(r/h)" };
  }
  // rotating space station: artificial gravity a = ω²r = g
  if (/artificial gravity|space station|giant wheel/.test(t)) {
    const omega = omegaOf(ctx.slots, ctx.text);
    if (/diameter/.test(t) && omega !== undefined) {
      return { value: (2 * G_ACC) / (omega * omega), unit: "m" }; // d = 2g/ω²
    }
    return { value: NaN, unit: "concept", concept: "T = 2π√(r/g) = 2π√(d/2g)" };
  }
  // T = 1/f — period of any oscillator driven/measured at frequency f
  if (/period|how long does (one|a) (cycle|oscillation|swing)/.test(t) && freqs.length) {
    return { value: 1 / freqs[0], unit: "s" };
  }
  // T = 2π√(m/k)
  if (masses.length && springs.length) {
    return { value: 2 * Math.PI * Math.sqrt(masses[0] / springs[0]), unit: "s" };
  }
  // f = 1/T
  if (/frequency/.test(t) && times.length && !masses.length && !lengths.length) {
    return { value: 1 / times[0], unit: "Hz" };
  }
  // pendulum: T = 2π√(L/g)
  if (lengths.length && !masses.length) {
    return { value: 2 * Math.PI * Math.sqrt(lengths[0] / G_ACC), unit: "s" };
  }
  // spring with assumed mid-range k
  if (masses.length) {
    const k = springs[0] ?? 50;
    return { value: 2 * Math.PI * Math.sqrt(masses[0] / k), unit: "s" };
  }
  // f = 1/T only when a time was actually given; otherwise the circuit
  // genuinely can't bind this phrasing (no universal fallback garbage)
  return times.length ? { value: 1 / times[0], unit: "Hz" } : { value: NaN, unit: "Hz" };
}

export const shm = { name: "shm", generate, solve };
