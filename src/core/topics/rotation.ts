/**
 * Rotation — moment of inertia, τ = Iα, rotational kinetic energy, τ = rF.
 * Shape awareness: hoop → MR², disk → ½MR², read from the problem text.
 */
import { buildChoices } from "./distractors";
import { takeAll } from "../extract";
import type { SolveCtx } from "../extract";
import type { Rng } from "../rng";
import type { BuiltProblem } from "./distractors";

export function generate(rng: Rng): BuiltProblem {
  const M = rng.pick([2, 3, 4, 5]);
  const R = rng.pick([0.2, 0.25, 0.3, 0.4, 0.5]);
  const alpha = rng.pick([1.5, 2, 2.5, 3, 4]);
  const shape = rng.int(0, 2);

  let I: number;
  let shapeTxt: string;
  let IName: string;
  if (shape === 0) {
    I = 0.5 * M * R * R;
    shapeTxt = "uniform disk";
    IName = "½MR²";
  } else if (shape === 1) {
    I = M * R * R;
    shapeTxt = "thin hoop";
    IName = "MR²";
  } else {
    I = M * R * R;
    shapeTxt = "thin spherical shell (I = MR²)";
    IName = "MR²";
  }

  const kind = rng.int(0, 1);
  if (kind === 1) {
    // rotational kinetic energy (matches the eval bank's phrasing)
    const omega = rng.pick([2, 3, 4, 5, 6]);
    const K = 0.5 * I * omega * omega;
    const scenario = `A ${shapeTxt} (M = ${M} kg, R = ${R} m) spins at ${omega} rad/s. What is its kinetic energy?`;
    const sol = `K = ½Iω² with I = ${IName} = ${round2(I)}`;
    return buildChoices(
      { value: K, unit: "J" },
      [I * omega * omega, 0.5 * M * omega * omega, K * 2, K / 2],
      rng,
      scenario,
      sol,
    );
  }

  const tau = I * alpha;
  const scenario = `A ${shapeTxt} of mass ${M} kg and radius ${R} m experiences a net torque of ${round2(tau)} N·m. What is its angular acceleration?`;
  const sol = `α = τ/I with I = ${IName} = ${round2(I)}`;
  return buildChoices(
    { value: alpha, unit: "rad/s²" },
    [(tau / (0.5 * M * R * R)), tau / M, alpha * 2, alpha / 2],
    rng,
    scenario,
    sol,
  );
}

function shapeInertia(ctx: SolveCtx, masses: number[], radii: number[]): number {
  const t = ctx.text.toLowerCase();
  const M = masses[0];
  const R = radii[0];
  if (/hoop/.test(t)) return M * R * R;
  if (/shell/.test(t)) return M * R * R;
  return 0.5 * M * R * R; // disk default
}

export function solve(ctx: SolveCtx): { value: number; unit: string } {
  const torques = takeAll(ctx.slots, "torque");
  const masses = takeAll(ctx.slots, "mass");
  const lengths = takeAll(ctx.slots, "length");
  const angAccs = takeAll(ctx.slots, "angular-acc");
  const angVels = takeAll(ctx.slots, "angular-vel");
  const inertias = takeAll(ctx.slots, "inertia");
  const forces = takeAll(ctx.slots, "force");
  const angles = takeAll(ctx.slots, "angle");
  const times = takeAll(ctx.slots, "time");
  const t = ctx.text.toLowerCase();

  const wantsI = /moment of inertia/.test(t);
  const wantsAlpha = /angular acceleration|\bα\b|\balpha\b/.test(t);
  const wantsTorque = /torque/.test(t) && !wantsAlpha;
  const wantsK = /kinetic energy/.test(t);
  const wantsOmega = /angular (velocity|speed)|\bω\b/.test(t);

  // ω given directly (converted to rad/s by the tokenizer)
  if (wantsOmega && angVels.length) {
    return { value: angVels[0], unit: "rad/s" };
  }
  // I by shape
  if (wantsI && masses.length && lengths.length) {
    return { value: shapeInertia(ctx, masses, lengths), unit: "kg·m²" };
  }
  // lever / seesaw balance: F·d = F′·d′ → F′ = F·d/d′, where d is the arm
  // the force sits on (nearest length in the text) and d′ the other arm
  if (/lever|seesaw|fulcrum|balance/.test(t) && forces.length && lengths.length >= 2 && !wantsTorque) {
    const fSlot = ctx.slots.find((s) => s.unit === "force")!;
    const lSlots = ctx.slots.filter((s) => s.unit === "length").slice(0, 2);
    // slot.text uses canonical units ("200 N") while the text may say
    // "200 newton", so search loosely: case-insensitive, then bare number
    const posOf = (s: { text: string }): number => {
      const hit = ctx.text.toLowerCase().indexOf(s.text.toLowerCase());
      return hit >= 0 ? hit : ctx.text.indexOf(s.text.split(" ")[0]);
    };
    const fPos = posOf(fSlot);
    const dist = (s: (typeof lSlots)[number]) => Math.abs(posOf(s) - fPos);
    const dKnown = dist(lSlots[0]) <= dist(lSlots[1]) ? lSlots[0] : lSlots[1];
    const dOther = dKnown === lSlots[0] ? lSlots[1] : lSlots[0];
    return { value: (fSlot.value * dKnown.value) / dOther.value, unit: "N" };
  }
  // τ = I·Δω/Δt (spin-down)
  if (wantsTorque && inertias.length && angVels.length && times.length) {
    return { value: (inertias[0] * angVels[0]) / times[0], unit: "N·m" };
  }
  // α = τ/I with both given explicitly
  if (torques.length && inertias.length) {
    return { value: torques[0] / inertias[0], unit: "rad/s²" };
  }
  // K = ½Iω²
  if (wantsK) {
    const I = inertias[0] ?? (masses.length && lengths.length ? shapeInertia(ctx, masses, lengths) : 0);
    if (angVels.length && I) return { value: 0.5 * I * angVels[0] * angVels[0], unit: "J" };
  }
  // τ = rF sinθ
  if (wantsTorque && forces.length && lengths.length) {
    const sinTheta = angles.length ? Math.sin(angles[0]) : 1;
    return { value: lengths[0] * forces[0] * sinTheta, unit: "N·m" };
  }
  // α = τ/I
  if (wantsAlpha && torques.length && inertias.length) {
    return { value: torques[0] / inertias[0], unit: "rad/s²" };
  }
  // α = τ/I with I by shape
  if (wantsAlpha && torques.length && masses.length && lengths.length) {
    return { value: torques[0] / shapeInertia(ctx, masses, lengths), unit: "rad/s²" };
  }
  // τ = Iα
  if (masses.length && lengths.length && angAccs.length && torques.length === 0) {
    return { value: shapeInertia(ctx, masses, lengths) * angAccs[0], unit: "N·m" };
  }
  // α = τ/I with assumed disk
  if (torques.length && masses.length && lengths.length) {
    return { value: torques[0] / (0.5 * masses[0] * lengths[0] * lengths[0]), unit: "rad/s²" };
  }
  return { value: NaN, unit: "rad/s²" };
}

function round2(x: number): string {
  return (Math.round(x * 100) / 100).toString();
}

export const rotation = { name: "rotation", generate, solve };
