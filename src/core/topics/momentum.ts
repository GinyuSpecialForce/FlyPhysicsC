/**
 * Momentum — collisions, impulse–momentum. The solver distinguishes impulse
 * (J = mΔv with rebound sign flip), sticky collisions, and p = mv by phrasing.
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
    // inelastic collision
    const m1 = rng.pick([1, 2, 3, 4]);
    const m2 = rng.pick([1, 2, 3, 4, 6]);
    const v1 = rng.pick([2, 3, 4, 5, 6]);
    const v2 = rng.pick([0, -1, -2, -3]);
    const vf = (m1 * v1 + m2 * v2) / (m1 + m2);
    const dirTxt = v2 < 0 ? `moving toward it at ${Math.abs(v2)} m/s` : "at rest";
    const scenario = `A ${m1} kg cart moving at ${v1} m/s collides and sticks to a ${m2} kg cart ${dirTxt}. What is their final velocity?`;
    const sol = `vf = (m₁v₁ + m₂v₂)/(m₁+m₂) = (${m1}·${v1} + ${m2}·${v2})/(${m1}+${m2})`;
    return buildChoices(
      { value: vf, unit: "m/s" },
      [(m1 * v1 - m2 * v2) / (m1 + m2), (m1 * v1) / m2, v1 - v2, (m1 + m2) * vf],
      rng,
      scenario,
      sol,
    );
  }

  // impulse: vf = v0 + FΔt/m
  const m = rng.pick([0.5, 1, 2, 3]);
  const v0 = rng.pick([2, 4, 5, 6]);
  const F = rng.pick([5, 8, 10, 12, 15]);
  const dt = rng.pick([0.1, 0.2, 0.25, 0.5]);
  const vf = v0 + (F * dt) / m;
  const scenario = `A ${m} kg mass moving at ${v0} m/s is pushed by a ${F} N force for ${dt} s. What is its final velocity?`;
  const sol = `vf = v₀ + FΔt/m = ${v0} + (${F})(${dt})/${m}`;
  return buildChoices(
    { value: vf, unit: "m/s" },
    [v0 - (F * dt) / m, (F * dt) / m, vf * 2, v0 + F * dt],
    rng,
    scenario,
    sol,
  );
}

export function solve(ctx: SolveCtx): SolveResult {
  const masses = takeAll(ctx.slots, "mass");
  const vels = takeAll(ctx.slots, "velocity");
  const forces = takeAll(ctx.slots, "force");
  const times = takeAll(ctx.slots, "time");
  const t = ctx.text.toLowerCase();

  const rebound = /rebound|bounces|approach.*leaves|hits a wall|strikes a wall/.test(t);
  const wantsImpulse = /impulse/.test(t);
  const wantsMomentum = /momentum/.test(t) && !/final velocity/.test(t);
  const elastic = /elastic/.test(t);
  const toward = /moving toward|toward it|toward each other|head-on|head on/.test(t);
  const wantsSecond = /velocity of the (second|target|other)|final velocity of the (second|target|other)/.test(t);

  // impulse with direction reversal: J = m(v_out + v_in)
  if (rebound && masses.length && vels.length >= 2) {
    return { value: masses[0] * (vels[0] + vels[1]), unit: "kg·m/s" };
  }
  // impulse J = FΔt or mΔv
  if (wantsImpulse && forces.length && times.length) {
    return { value: forces[0] * times[0], unit: "kg·m/s" };
  }
  // p = mv
  if (wantsMomentum && masses.length && vels.length) {
    return { value: masses[0] * vels[0], unit: "kg·m/s" };
  }
  // elastic collision: v1f = ((m1−m2)v1 + 2m2v2)/(m1+m2) (2m2v1 for the target)
  if (elastic && masses.length >= 2 && vels.length) {
    const v1 = vels[0];
    const v2 =
      vels.length >= 2 ? (toward ? -Math.abs(vels[1]) : vels[1]) : 0;
    const m1 = masses[0];
    const m2 = masses[1];
    const vf = wantsSecond
      ? ((m2 - m1) * v2 + 2 * m1 * v1) / (m1 + m2)
      : ((m1 - m2) * v1 + 2 * m2 * v2) / (m1 + m2);
    return { value: vf, unit: "m/s" };
  }
  // sticky collision: vf = (m1·v1 + m2·v2)/(m1+m2); "moving toward" means v2 opposes v1
  if (masses.length >= 2 && vels.length && /sticks?|collide|holds|collides/.test(t)) {
    const v1 = vels[0];
    const v2 = toward ? -Math.abs(vels[1]) : (vels[1] ?? 0);
    return { value: (masses[0] * v1 + masses[1] * v2) / (masses[0] + masses[1]), unit: "m/s" };
  }
  // impulse → final velocity: vf = v0 + FΔt/m
  if (forces.length && times.length && masses.length && vels.length) {
    return { value: vels[0] + (forces[0] * times[0]) / masses[0], unit: "m/s" };
  }
  // p = mv fallback
  if (masses.length && vels.length) {
    return { value: masses[0] * vels[0], unit: "kg·m/s" };
  }
  return { value: NaN, unit: "kg·m/s" };
}

export const momentum = { name: "momentum", generate, solve };
