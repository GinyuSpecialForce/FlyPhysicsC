/**
 * Capacitors — Q = CV, U = ½CV², series/parallel equivalents, V from U & C.
 */
import { buildChoices } from "./distractors";
import { takeAll } from "../extract";
import type { SolveCtx } from "../extract";
import type { SolveResult } from "./index";
import type { Rng } from "../rng";
import type { BuiltProblem } from "./distractors";

export function generate(rng: Rng): BuiltProblem {
  const C = rng.pick([2, 5, 10, 20, 50]) * 1e-6;
  const V = rng.pick([6, 9, 12, 20, 24]);
  const U = 0.5 * C * V * V;
  const Q = C * V;
  const wantCharge = rng.chance(0.5);

  if (wantCharge) {
    const scenario = `A ${Math.round(C * 1e6)} μF capacitor is charged to ${V} V. What charge does it hold?`;
    const sol = `Q = CV = ${C * 1e6}μF × ${V}V`;
    return buildChoices(
      { value: Q * 1e6, unit: "μC" },
      [Q * 1e6 * 2, (Q * 1e6) / 2, C * 1e6 + V, (C * 1e6) ** 2],
      rng,
      scenario,
      sol,
    );
  }

  const scenario = `A ${Math.round(C * 1e6)} μF capacitor is charged to ${V} V. How much energy does it store?`;
  const sol = `U = ½CV² = ½(${Math.round(C * 1e6)}μF)(${V}V)²`;
  return buildChoices(
    { value: U, unit: "J" },
    [C * V * V, 0.5 * C * V, U / 2, C * V],
    rng,
    scenario,
    sol,
  );
}

export function solve(ctx: SolveCtx): SolveResult {
  const caps = takeAll(ctx.slots, "capacitance");
  const volts = takeAll(ctx.slots, "voltage");
  const energies = takeAll(ctx.slots, "energy");
  const t = ctx.text.toLowerCase();

  // equivalent capacitance (series/parallel)
  if (/equivalent capacitance/.test(t) && caps.length >= 2) {
    const parallel = /parallel/.test(ctx.text);
    const ceq = parallel
      ? caps[0] + caps[1]
      : (caps[0] * caps[1]) / (caps[0] + caps[1]);
    // value stays SI (farads); displayScale converts to μF for display
    return { value: ceq, unit: "μF", displayScale: 1e-6 };
  }
  // V = √(2U/C)
  if (/voltage/.test(t) && energies.length && caps.length) {
    return { value: Math.sqrt((2 * energies[0]) / caps[0]), unit: "V" };
  }
  // Q = CV (value SI in coulombs; displayScale converts to μC) — \b so
  // "charged to 9 V" doesn't trigger the charge branch
  if (/\bcharge\b/.test(t) && caps.length && volts.length) {
    return { value: caps[0] * volts[0], unit: "μC", displayScale: 1e-6 };
  }
  // U = ½CV²
  if (caps.length && volts.length) {
    return { value: 0.5 * caps[0] * volts[0] * volts[0], unit: "J" };
  }
  return { value: NaN, unit: "J" };
}

export const capacitors = { name: "capacitors", generate, solve };
