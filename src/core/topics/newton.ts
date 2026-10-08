/**
 * Newton's laws — F = ma with friction (μ extracted where given, assumed
 * mid-range only for generator-style flat-surface pulls).
 */
import { buildChoices } from "./distractors";
import { take, takeAll, omegaOf, radiusOf } from "../extract";
import type { SolveCtx } from "../extract";
import type { SolveResult } from "./index";
import { G_ACC, R_EARTH } from "../constants";
import { worldGravity } from "../constant-table";
import type { Rng } from "../rng";
import type { BuiltProblem } from "./distractors";

export function generate(rng: Rng): BuiltProblem {
  const m = rng.pick([2, 3, 4, 5, 8, 10, 12]);
  const a = rng.pick([1.5, 2, 2.5, 3, 4]);
  const mu = rng.pick([0, 0.1, 0.15, 0.2, 0.25, 0.3]);
  const F = m * a + mu * m * G_ACC;

  const muTxt =
    mu === 0
      ? "a frictionless surface"
      : `a surface with coefficient of kinetic friction μ = ${mu}`;
  const scenario = `A ${m} kg block is pulled across ${muTxt} with a horizontal force of ${round2(F)} N. What is the block's acceleration?`;
  const sol = `a = (F − μmg)/m = (${round2(F)} − ${mu}·${m}·9.8)/${m}`;

  return buildChoices(
    { value: a, unit: "m/s²" },
    [F / m + mu * G_ACC, (F - mu * m * G_ACC) / (2 * m), a + mu, F / (m * G_ACC)],
    rng,
    scenario,
    sol,
  );
}

/** Surface gravity of the named world in the text (Jupiter, Pluto, …), else Earth's. */
function worldG(t: string): number {
  return worldGravity(t);
}

export function solve(ctx: SolveCtx): SolveResult {
  const forces = takeAll(ctx.slots, "force");
  const masses = takeAll(ctx.slots, "mass");
  const accs = takeAll(ctx.slots, "acceleration");
  const springs = takeAll(ctx.slots, "spring-k");
  const lengths = takeAll(ctx.slots, "length");
  const vels = takeAll(ctx.slots, "velocity");
  const times = takeAll(ctx.slots, "time");
  const mu = take(ctx.slots, "mu-coeff");
  const omega = omegaOf(ctx.slots, ctx.text);
  const r = radiusOf(ctx.slots, ctx.text);
  const t = ctx.text.toLowerCase();

  const wantsForce = /\bforce\b/.test(t);
  // "what force is needed to slide it" / "what is the force of friction" —
  // NOT "what is the net force" (which wants F = ma, or F − μmg)
  const wantsFrictionForce =
    /force of friction|friction force|force (?:is |would be |must be )?(?:needed|required)|force to (?:slide|move|start)|how much force|force required/.test(t) &&
    !/net force/.test(t);

  // ── noninertial-frame / friction-direction concepts ─────────
  if (/fictitious/.test(t)) {
    return {
      value: NaN,
      unit: "concept",
      concept: "only gravity and the normal force are real; inertia keeps you moving straight while the floor accelerates you inward",
    };
  }
  if (/turntable rotates θ|friction changes by 90/.test(t)) {
    return {
      value: NaN,
      unit: "concept",
      concept: "friction's absolute direction: θ + arctan(2θ) = 90° → θ = 37.4°",
    };
  }
  if (/maximum angle θ|maximum angle|expression in terms of a and/.test(t)) {
    return { value: NaN, unit: "concept", concept: "θ_max = ½·√((μs·g/a)² − 1)" };
  }
  if (/direction of static friction|sketch the direction/.test(t)) {
    return { value: NaN, unit: "concept", concept: "tangent at first, then increasingly radial" };
  }
  if (/greatest frequency|maximum frequency/.test(t) && /platter|sliding off|revolve/.test(t)) {
    return { value: NaN, unit: "concept", concept: "f = (1/2π)·√(μs·g/r)" };
  }

  // ── rotating Earth / centrifugal effects at the equator ─────────
  // day length for levitation: ω²R⊕ = g → T = 2π√(R⊕/g)
  if (/levitate|levitation/.test(t)) {
    return { value: 2 * Math.PI * Math.sqrt(R_EARTH / G_ACC), unit: "s" };
  }
  const wEq = (2 * Math.PI) / 86400;
  if (/centrifugal force/.test(t) && masses.length) {
    return { value: masses[0] * wEq * wEq * R_EARTH, unit: "N" };
  }
  if (/equator/.test(t) && /accelerat/.test(t)) {
    return { value: wEq * wEq * R_EARTH, unit: "m/s²" };
  }

  // friction force balancing a constant-velocity pull
  if (/friction force/.test(t) && /constant velocity/.test(t) && forces.length) {
    return { value: forces[0], unit: "N" };
  }
  // sling / centripetal force: F = mω²r (ω from rpm, Hz, or the period) —
  // circular context only, so a swinging pendulum's tension stays T = mg
  if (
    (wantsForce || /tension|centripetal|normal force/.test(t)) &&
    /circle|circular|whirl|twirl|sling|spin|rotat|carousel|platter|turntable|washer|cone|orbit/.test(t) &&
    masses.length &&
    r !== undefined &&
    omega !== undefined
  ) {
    return { value: masses[0] * omega * omega * r, unit: "N" };
  }
  // the same tension from a given tangential speed: F_c = mv²/r. Without this
  // the tension branch below falls through to T = mg, which is the weight, not
  // the centripetal force.
  if (
    (wantsForce || /tension|centripetal/.test(t)) &&
    /circle|circular|whirl|twirl|sling|spin|rotat|carousel|platter|turntable|washer|cone|orbit|string/.test(t) &&
    masses.length &&
    vels.length &&
    r !== undefined
  ) {
    return { value: (masses[0] * vels[0] * vels[0]) / r, unit: "N" };
  }
  // minimum μs so a spinning object doesn't slide: μs·N = mg → μs = g/a_c
  if (/(?:minimum value of|value of μ|coefficient of static)/.test(t) && masses.length && omega !== undefined && r !== undefined) {
    return { value: G_ACC / (omega * omega * r), unit: "μs" };
  }
  // vertical circle: T = m(a_c ∓ g) at top/bottom, with a_c at the top or
  // bottom converted between them via v²/r ± 2g
  if (/tension/.test(t) && masses.length && accs.length && r !== undefined && /highest|lowest|top|bottom/.test(t)) {
    const givenAtBottom = /acceleration.{0,40}at the (?:lowest|bottom)/.test(t);
    const aBot = givenAtBottom ? accs[0] : accs[0] + 4 * G_ACC;
    const aTop = givenAtBottom ? accs[0] - 4 * G_ACC : accs[0];
    if (/highest|top/.test(t)) {
      return { value: masses[0] * Math.max(0, aTop - G_ACC), unit: "N" };
    }
    return { value: masses[0] * (aBot + G_ACC), unit: "N" };
  }
  // maximum centripetal friction (skid-pad rating): F = μmg = m·a_f
  if (/friction/.test(t) && /maximum|greatest|most/.test(t) && masses.length && (accs.length || mu !== undefined)) {
    return { value: masses[0] * (accs[0] ?? mu! * G_ACC), unit: "N" };
  }
  // parachute/chute cords: T = m(g + |Δv/Δt|) on whatever world they're on
  if (/chute|parachute/.test(t) && masses.length && vels.length >= 2 && times.length) {
    return {
      value: masses[0] * (worldG(t) + Math.abs(vels[1] - vels[0]) / times[0]),
      unit: "N",
    };
  }
  // tension on a hanging mass: T = mg
  if (/tension/.test(t) && masses.length && !accs.length && !forces.length) {
    return { value: masses[0] * G_ACC, unit: "N" };
  }
  // F = kx — force a spring exerts when compressed/stretched x
  if (wantsForce && /spring/.test(t) && springs.length && lengths.length && !/accelerat/.test(t)) {
    return { value: springs[0] * lengths[0], unit: "N" };
  }
  // F = μmg — force needed to slide against friction
  if (wantsFrictionForce && mu !== undefined && masses.length && !accs.length) {
    return { value: mu * masses[0] * G_ACC, unit: "N" };
  }
  // a = (F − μmg)/m
  if (/accelerat/.test(t) && forces.length && masses.length) {
    const frictionless = /frictionless/.test(t);
    const muEff = frictionless ? 0 : (mu ?? 0.2);
    return { value: (forces[0] - muEff * masses[0] * G_ACC) / masses[0], unit: "m/s²" };
  }
  // F = ma
  if (wantsForce && masses.length && accs.length) {
    return { value: masses[0] * accs[0], unit: "N" };
  }
  // generic fallbacks
  if (masses.length && accs.length) return { value: masses[0] * accs[0], unit: "N" };
  if (forces.length && masses.length) {
    const muEff = mu ?? 0.2;
    return { value: (forces[0] - muEff * masses[0] * G_ACC) / masses[0], unit: "m/s²" };
  }
  if (forces.length && accs.length) return { value: forces[0] / accs[0], unit: "kg" };
  return { value: NaN, unit: "N" };
}

function round2(x: number): string {
  return (Math.round(x * 100) / 100).toString();
}

export const newton = { name: "newton", generate, solve };
