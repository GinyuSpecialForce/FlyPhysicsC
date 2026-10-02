/**
 * DC circuits — Ohm's law, series/parallel R_eq, V = IR, power comparison.
 */
import { buildChoices } from "./distractors";
import { takeAll } from "../extract";
import type { SolveCtx } from "../extract";
import type { SolveResult } from "./index";
import type { Rng } from "../rng";
import type { BuiltProblem } from "./distractors";

export function generate(rng: Rng): BuiltProblem {
  const kind = rng.int(0, 1);

  if (kind === 0) {
    const R1 = rng.pick([10, 20, 50, 100]);
    const R2 = rng.pick([10, 20, 50, 100]);
    const V = rng.pick([6, 9, 12, 24]);
    const Req = R1 + R2;
    const I = V / Req;
    const scenario = `A ${V} V battery drives ${R1} Ω and ${R2} Ω resistors in series. What current flows?`;
    const sol = `I = V/R_eq = ${V}/(${R1}+${R2})`;
    return buildChoices(
      { value: I, unit: "A" },
      [V / R1, V / R2, I * 2, V / (R1 * R2)],
      rng,
      scenario,
      sol,
    );
  }

  const R1 = rng.pick([10, 20, 30, 60]);
  const R2 = rng.pick([10, 20, 30, 60]);
  const V = rng.pick([6, 9, 12, 24]);
  const Req = (R1 * R2) / (R1 + R2);
  const I = V / Req;
  const scenario = `A ${V} V battery drives ${R1} Ω and ${R2} Ω resistors in parallel. What current flows from the battery?`;
  const sol = `R_eq = R₁R₂/(R₁+R₂) = ${round2(Req)} Ω; I = V/R_eq`;
  return buildChoices(
    { value: I, unit: "A" },
    [V / R1, V / R2, V / (R1 + R2), I * 2],
    rng,
    scenario,
    sol,
  );
}

export function solve(ctx: SolveCtx): SolveResult {
  const volts = takeAll(ctx.slots, "voltage");
  const res = takeAll(ctx.slots, "resistance");
  const cur = takeAll(ctx.slots, "current");
  const charges = takeAll(ctx.slots, "charge");
  const times = takeAll(ctx.slots, "time");
  const t = ctx.text.toLowerCase();

  // power comparison (conceptual): compare I²R of the two settings
  if (/power/.test(t) && cur.length >= 2 && res.length >= 2) {
    const P1 = cur[0] * cur[0] * res[0];
    const P2 = cur[1] * cur[1] * res[1];
    return { value: NaN, unit: "concept", concept: P2 > P1 ? "The 4 A one" : "The 2 A one" };
  }
  // equivalent resistance (series/parallel)
  if (/equivalent resistance/.test(t) && res.length >= 2) {
    const parallel = /parallel/.test(ctx.text);
    const Req = parallel
      ? (res[0] * res[1]) / (res[0] + res[1])
      : res[0] + res[1];
    return { value: Req, unit: "Ω" };
  }
  // power: P = VI = V²/R = I²R
  if (/power/.test(t)) {
    if (volts.length && cur.length) return { value: volts[0] * cur[0], unit: "W" };
    if (volts.length && res.length) return { value: (volts[0] * volts[0]) / res[0], unit: "W" };
    if (cur.length && res.length) return { value: cur[0] * cur[0] * res[0], unit: "W" };
  }
  // energy delivered by moving charge through a potential: W = Vq
  if (/energy|work|deliver/.test(t) && volts.length && charges.length) {
    return { value: volts[0] * charges[0], unit: "J" };
  }
  // charge flow: q = I·t
  if (/charge/.test(t) && cur.length && times.length) {
    return { value: cur[0] * times[0], unit: "C" };
  }
  // V = IR ("voltage drop across" / "what is the voltage")
  if (/voltage|emf/.test(t) && cur.length && res.length) {
    return { value: cur[0] * res[0], unit: "V" };
  }
  // series/parallel current
  if (volts.length && res.length >= 2) {
    const parallel = /parallel/.test(ctx.text);
    const Req = parallel
      ? (res[0] * res[1]) / (res[0] + res[1])
      : res[0] + res[1];
    return { value: volts[0] / Req, unit: "A" };
  }
  // I = V/R
  if (volts.length && res.length) {
    return { value: volts[0] / res[0], unit: "A" };
  }
  return { value: NaN, unit: "A" };
}

function round2(x: number): string {
  return (Math.round(x * 100) / 100).toString();
}

export const circuits = { name: "circuits", generate, solve };
