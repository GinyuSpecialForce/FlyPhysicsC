/**
 * Magnetism — F = qvB, F = BIL sin θ, and the proton-vs-electron radius
 * concept question.
 */
import { buildChoices } from "./distractors";
import { takeAll } from "../extract";
import type { SolveCtx } from "../extract";
import type { SolveResult } from "./index";
import { E_CHARGE } from "../constants";
import { superscript } from "../format";
import type { Rng } from "../rng";
import type { BuiltProblem } from "./distractors";

function sci(x: number): string {
  const exp = Math.floor(Math.log10(x));
  const mant = x / 10 ** exp;
  return `${mant}×10${superscript(exp)}`;
}

export function generate(rng: Rng): BuiltProblem {
  const kind = rng.int(0, 1);

  if (kind === 0) {
    const v = rng.pick([1e5, 2e5, 5e5, 1e6, 2e6]);
    const B = rng.pick([0.1, 0.2, 0.5, 1]);
    const F = E_CHARGE * v * B;
    const scenario = `A proton moving at ${sci(v)} m/s enters a ${B} T magnetic field perpendicular to its velocity. What is the magnetic force on it?`;
    const sol = `F = qvB = 1.6×10⁻¹⁹ · ${sci(v)} · ${B}`;
    return buildChoices(
      { value: F, unit: "N" },
      [F * 2, F / 2, E_CHARGE * v, F / B],
      rng,
      scenario,
      sol,
    );
  }

  const I = rng.pick([0.5, 1, 2, 5]);
  const L = rng.pick([0.1, 0.2, 0.25, 0.5]);
  const B = rng.pick([0.1, 0.2, 0.5, 1, 2]);
  const thetaDeg = rng.pick([90, 30]);
  const sinT = thetaDeg === 90 ? 1 : Math.sin((thetaDeg * Math.PI) / 180);
  const F = B * I * L * sinT;
  const atTxt = thetaDeg === 90 ? "perpendicular to" : "at 30° to";
  const scenario = `A wire carrying ${I} A runs ${L} m through a ${B} T field ${atTxt} it. What force does it feel?`;
  const sol =
    thetaDeg === 90
      ? `F = BIL = ${B}·${I}·${L}`
      : `F = BIL sin30° = ${B}·${I}·${L}·0.5`;
  return buildChoices(
    { value: F, unit: "N" },
    [F * 2, F / 2, B * I, F / L],
    rng,
    scenario,
    sol,
  );
}

export function solve(ctx: SolveCtx): SolveResult {
  const charges = takeAll(ctx.slots, "charge");
  const vels = takeAll(ctx.slots, "velocity");
  const bFields = takeAll(ctx.slots, "field-b");
  const currents = takeAll(ctx.slots, "current");
  const lengths = takeAll(ctx.slots, "length");
  const angles = takeAll(ctx.slots, "angle");
  const t = ctx.text.toLowerCase();

  // r = mv/qB concept: proton path is much larger (mass dominates)
  if (/path radius|radius is/.test(t) && /proton|electron/.test(t)) {
    return { value: NaN, unit: "concept", concept: "Larger" };
  }
  // force vanishes when motion is parallel to the field
  if (/parallel to a magnetic field|parallel to the (magnetic )?field/.test(t)) {
    return { value: NaN, unit: "concept", concept: "0" };
  }
  // F = qvB (proton/electron charge substituted when not stated numerically)
  if (vels.length && bFields.length && (charges.length || /proton|electron/.test(t))) {
    const q = charges[0] ?? (/electron/.test(t) ? -E_CHARGE : E_CHARGE);
    return { value: Math.abs(q * vels[0] * bFields[0]), unit: "N" };
  }
  // F = BIL sinθ
  if (currents.length && lengths.length && bFields.length) {
    const sinT = angles.length ? Math.sin(angles[0]) : 1;
    return { value: bFields[0] * currents[0] * lengths[0] * sinT, unit: "N" };
  }
  return { value: NaN, unit: "N" };
}

export const magnetism = { name: "magnetism", generate, solve };
