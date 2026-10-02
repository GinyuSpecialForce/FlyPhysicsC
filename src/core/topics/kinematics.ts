/**
 * Kinematics — 1D motion with constant acceleration. Solver is context-aware:
 * the same slot signature (v, a, t) can ask for final speed, distance, or
 * acceleration, so it reads the question phrasing.
 */
import { buildChoices } from "./distractors";
import { take, takeAll, omegaOf, radiusOf } from "../extract";
import type { SolveCtx } from "../extract";
import type { SolveResult } from "./index";
import { G_ACC } from "../constants";
import type { Rng } from "../rng";
import type { BuiltProblem } from "./distractors";

function fmt2(v: number): string {
  return String(Math.round(v * 10) / 10);
}

export function generate(rng: Rng): BuiltProblem {
  const kind = rng.int(0, 3);

  if (kind === 0) {
    const v0 = rng.pick([2, 2.5, 3, 4, 5, 8, 12, 15]);
    const a = rng.pick([1.5, 2, 2.5, 3, -1.5, -2, -3]);
    const t = rng.pick([2, 3, 4, 5, 6]);
    const v = v0 + a * t;
    const scenario = `A cart moving at ${fmt2(v0)} m/s accelerates at ${a} m/s² for ${t} s. What is its final velocity?`;
    const sol = `v = v₀ + at = ${fmt2(v0)} + (${a})(${t})`;
    return buildChoices(
      { value: v, unit: "m/s" },
      [v0, v + a, v0 - a * t, 2 * v],
      rng,
      scenario,
      sol,
    );
  }

  if (kind === 1) {
    const v0 = rng.pick([2, 3, 4, 5, 8, 10]);
    const a = rng.pick([1, 2, 2.5, 3, 4]);
    const t = rng.pick([2, 3, 4]);
    const x = v0 * t + 0.5 * a * t * t;
    const scenario = `Starting at ${fmt2(v0)} m/s, an object accelerates at ${a} m/s² for ${t} s. How far does it travel?`;
    const sol = `x = v₀t + ½at² = ${fmt2(v0)}(${t}) + ½(${a})(${t}²)`;
    return buildChoices(
      { value: x, unit: "m" },
      [v0 * t, 0.5 * a * t * t, 2 * x, x / 2],
      rng,
      scenario,
      sol,
    );
  }

  if (kind === 3) {
    // uniform circular motion: centripetal acceleration a = (2πf)²r
    const f = rng.pick([0.5, 1, 1.5, 2, 3]);
    const r = rng.pick([0.25, 0.4, 0.5, 0.75, 1.5]);
    const a = (2 * Math.PI * f) ** 2 * r;
    const scenario = `A rock is twirled in a circle at ${f} Hz with radius ${r} m. What is its centripetal acceleration?`;
    const sol = `a = ω²r = (2πf)²r = (2π·${f})²(${r})`;
    return buildChoices(
      { value: a, unit: "m/s²" },
      [2 * Math.PI * f * r, (2 * Math.PI * f) * r * r, a / 2, a * 2],
      rng,
      scenario,
      sol,
    );
  }

  // free fall: drop height → impact speed
  const h = rng.pick([10, 20, 25, 31, 45, 50, 78, 80]);
  const v = Math.sqrt(2 * G_ACC * h);
  const scenario = `A ball is dropped from ${h} m. What is its speed just before impact (ignore air resistance)?`;
  const sol = `v = √(2gh) = √(2·9.8·${h})`;
  return buildChoices(
    { value: v, unit: "m/s" },
    [Math.sqrt(G_ACC * h), 2 * v, v / 2, G_ACC * h],
    rng,
    scenario,
    sol,
  );
}

export function solve(ctx: SolveCtx): SolveResult {
  const vels = takeAll(ctx.slots, "velocity");
  const accs = takeAll(ctx.slots, "acceleration");
  const times = takeAll(ctx.slots, "time");
  const lengths = takeAll(ctx.slots, "length");
  const forces = takeAll(ctx.slots, "force");
  const masses = takeAll(ctx.slots, "mass");
  const t = ctx.text.toLowerCase();

  const wantsAccel = /accelerat/.test(t);
  const wantsSpeed = /final velocity|final speed|speed|velocity/.test(t);
  const wantsDistance = /how far|distance|travel|displacement/.test(t);
  const wantsHeight = /how (high|tall)|height|cliff|rise|rises/.test(t);

  // ── circular / curricular motion concepts ───────────────────
  if (/impossible to round a curve|round a curve.*without accelerating/.test(t)) {
    return { value: NaN, unit: "concept", concept: "direction changes → velocity changes" };
  }
  if (/one type of curve.*constant acceleration|constant acceleration.*one type of curve/.test(t)) {
    return { value: NaN, unit: "concept", concept: "parabola — not a circle" };
  }
  if (/circular curve.*not constant acceleration|why.*circular.*not.*constant/.test(t)) {
    return { value: NaN, unit: "concept", concept: "a changes direction" };
  }
  if (/centripetal and centrifugal|centrifugal and centripetal/.test(t)) {
    return {
      value: NaN,
      unit: "concept",
      concept: "centripetal is real (center-seeking); centrifugal is fictitious (inertia)",
    };
  }
  if (/explain why the ball|why does the ball/.test(t)) {
    return {
      value: NaN,
      unit: "concept",
      concept: "nothing pulls it inward — inertia carries it straight (no centripetal force)",
    };
  }
  // the curve-time relation as a formula, when asked to derive it
  if (/derive an expression/.test(t) && /acceleration in terms|centripetal acceleration in terms/.test(t)) {
    return { value: NaN, unit: "concept", concept: "a = v·θ/t" };
  }
  // ── uniform circular motion ─────────────────────────────────
  // a = ω²r (ω from rpm, rad/s, Hz, or the period), v = ωr, a = v²/r
  const omega = omegaOf(ctx.slots, ctx.text);
  const r = radiusOf(ctx.slots, ctx.text);
  const circular = /circle|circular|whirl|twirl|sling|carousel|platter|turntable|washer|conical/.test(t);
  if (r !== undefined && (omega !== undefined || circular) && !accs.length) {
    if (wantsAccel && omega !== undefined && !vels.length) {
      return { value: omega * omega * r, unit: "m/s²" };
    }
    // a = v²/r only for a lone speed with no time (never Δv/Δt phrasings)
    if (wantsAccel && vels.length === 1 && !times.length) {
      return { value: (vels[0] * vels[0]) / r, unit: "m/s²" };
    }
    if (wantsSpeed && omega !== undefined && !vels.length) {
      return { value: omega * r, unit: "m/s" };
    }
  }
  // radius from a known centripetal acceleration: r = a/ω² ("at what radius
  // are the riders?") — no length is given in such problems
  const wantsRadius = /radius/.test(t) && /what|which|find|determine|calculate|at which|minimum|maximum|tightest|smallest/.test(t);
  if (wantsRadius && accs.length && omega !== undefined && !vels.length && !lengths.length) {
    return { value: accs[0] / (omega * omega), unit: "m" };
  }
  // speed when only the centripetal acceleration is known: v = ωr = a/ω
  if (
    wantsSpeed &&
    accs.length &&
    omega !== undefined &&
    !vels.length &&
    !lengths.length &&
    /spin|rotat|riders|cylinder|circle|carousel|carnival/.test(t)
  ) {
    return { value: accs[0] / omega, unit: "m/s" };
  }

  const angles = takeAll(ctx.slots, "angle");
  const mu = take(ctx.slots, "mu-coeff");

  // cycloid (rock in a rolling tire): x = vt − r·sin(vt/r), y = r(1 − cos(vt/r))
  if (/parametric equations/.test(t) && /rock|tread|bicycle|tire/.test(t)) {
    return {
      value: NaN,
      unit: "concept",
      concept: "x = vt − r·sin(vt/r), y = r(1 − cos(vt/r))",
    };
  }

  // parametric circular motion x = A cos(ωt), y = A sin(ωt)
  const pm = /x\s*\(?t?\)?\s*=\s*([\d.]+)\s*(?:cos|sin)\s*\(\s*([\d.]+)\s*t/i.exec(ctx.text);
  if (pm && /parametric/.test(t)) {
    const A = parseFloat(pm[1]);
    const w = parseFloat(pm[2]);
    if (/period|how long/.test(t)) return { value: (2 * Math.PI) / w, unit: "s" };
    if (wantsAccel) return { value: w * w * A, unit: "m/s²" };
    if (wantsSpeed) return { value: w * A, unit: "m/s" };
    return { value: A, unit: "m" };
  }

  // a = v·Δθ/Δt — turning through an angle at constant speed
  if (wantsAccel && vels.length && times.length && angles.length && /direction/.test(t)) {
    return { value: (vels[0] * angles[0]) / times[0], unit: "m/s²" };
  }
  // time around a curve while speed changes uniformly: t = rθ/v̄
  const curveTheta =
    angles[0] ??
    (/u-turn|reverse directions|half (?:the )?(?:circle|turn|lap)/.test(t)
      ? Math.PI
      : /quarter|west to south|north to east|east to north|south to west/.test(t)
        ? Math.PI / 2
        : undefined);
  if (/time for the car|time to round|take to round|how long.*curve/.test(t) && vels.length >= 2 && r !== undefined && curveTheta !== undefined) {
    return { value: (r * curveTheta) / ((vels[0] + vels[1]) / 2), unit: "s" };
  }
  // total acceleration halfway around a curve that slows uniformly:
  // a = √(a_r² + a_t²) with v_mid² = (v0² + v1²)/2; the time to round the
  // curve is given, or derived from the arc: t = rθ/v̄
  if (wantsAccel && vels.length >= 2 && r !== undefined && /halfway|midpoint|middle|half of the curve/.test(t)) {
    const dt = times[0] ?? (curveTheta !== undefined ? (r * curveTheta) / ((vels[0] + vels[1]) / 2) : undefined);
    if (dt !== undefined) {
      const vm2 = (vels[0] * vels[0] + vels[1] * vels[1]) / 2;
      const aR = vm2 / r;
      const aT = (vels[1] - vels[0]) / dt;
      return { value: Math.sqrt(aR * aR + aT * aT), unit: "m/s²" };
    }
  }
  // nonuniform circular motion components
  if (vels.length >= 2 && r !== undefined && /radial/.test(t)) {
    const vm = (vels[0] + vels[1]) / 2;
    return { value: (vm * vm) / r, unit: "m/s²" };
  }
  if (vels.length >= 2 && times.length && /tangential/.test(t)) {
    return { value: (vels[1] - vels[0]) / times[0], unit: "m/s²" };
  }

  // vertical circle: v_bottom = √(a·r), v_top = √(r(a − 4g))
  if (wantsSpeed && accs.length && r !== undefined && /vertical|highest|lowest/.test(t)) {
    if (/highest|top/.test(t) && accs[0] > 4 * G_ACC) {
      return { value: Math.sqrt(r * (accs[0] - 4 * G_ACC)), unit: "m/s" };
    }
    if (/lowest|bottom/.test(t)) {
      return { value: Math.sqrt(accs[0] * r), unit: "m/s" };
    }
    if (vels.length && /highest|top/.test(t) && vels[0] * vels[0] > 4 * G_ACC * r) {
      return { value: Math.sqrt(vels[0] * vels[0] - 4 * G_ACC * r), unit: "m/s" };
    }
  }

  // cycloid (rock in a rolling tire): max speed = 2v, first at t = πr/v
  if (/rock|tread|cycloid/.test(t) && vels.length) {
    if (/point in time|at which it occurs|first time|when does it|when it occurs|first reach/.test(t) && r !== undefined) {
      return { value: (Math.PI * r) / vels[0], unit: "s" };
    }
    if (/maximum|max speed|greatest speed/.test(t) && wantsSpeed) {
      return { value: 2 * vels[0], unit: "m/s" };
    }
  }

  // friction-limited curve speed: v_max = √(a_friction·r)
  if (wantsSpeed && /maximum|max|fastest|greatest/.test(t) && r !== undefined && (accs.length || mu !== undefined) && /circle|curve|turn|round/.test(t)) {
    return { value: Math.sqrt((accs[0] ?? mu! * G_ACC) * r), unit: "m/s" };
  }
  // minimum turn radius from friction: r = m·v²/(μ·N) — N may include a
  // downforce ("wing"/"spoiler"); without one N = mg
  if (/radius/.test(t) && /\bmin\b|minimum|tightest|smallest/.test(t) && vels.length && (mu !== undefined || accs.length) && /turn|curve|round/.test(t)) {
    const aF = mu !== undefined ? mu * G_ACC : accs[0];
    const wingOff = /without (?:the )?(?:wing|spoiler)|(?:wing|spoiler) (?:is )?removed|no (?:wing|spoiler)/.test(t);
    const down = wingOff ? 0 : forces[0] ?? 0;
    const m = masses[0];
    if (m !== undefined) {
      // r = m·v² / (μ·(mg + F_down)) = m·v² / (m·a_f + μ·F_down)
      return { value: (m * vels[0] * vels[0]) / (m * aF + (aF / G_ACC) * down), unit: "m" };
    }
    return { value: (vels[0] * vels[0]) / aF, unit: "m" };
  }
  // minimum U-turn time at speed v: t = πr/v with r = v²/a_f → πv/a_f
  if (/u-turn|reverse directions|half (?:circle|turn)/.test(t) && vels.length && (accs.length || mu !== undefined)) {
    return { value: (Math.PI * vels[0]) / (accs[0] ?? mu! * G_ACC), unit: "s" };
  }

  // a = Δv/Δt (e.g. "from rest to 9 m/s in 3 s" — single speed is the
  // final one; "slows from 25 m/s to rest" — single speed is the initial one)
  if (wantsAccel && vels.length && times.length && !accs.length) {
    const toRest = /to rest|come to rest|comes to rest|stops|stopping/.test(t);
    if (vels.length >= 2) return { value: (vels[1] - vels[0]) / times[0], unit: "m/s²" };
    return { value: (toRest ? -vels[0] : vels[0]) / times[0], unit: "m/s²" };
  }
  // v = v0 + at
  if (wantsSpeed && accs.length && times.length) {
    const v0 = vels[0] ?? 0;
    return { value: v0 + accs[0] * times[0], unit: "m/s" };
  }
  // braking distance: x = v²/(2|a|) — only with braking context
  if (wantsDistance && accs.length && vels.length && /brake|stop|stopping|decelerat/.test(t)) {
    return { value: (vels[0] * vels[0]) / (2 * Math.abs(accs[0])), unit: "m" };
  }
  // x = v0 t + ½ a t²
  if (wantsDistance && accs.length && times.length) {
    const v0 = vels[0] ?? 0;
    return { value: v0 * times[0] + 0.5 * accs[0] * times[0] * times[0], unit: "m" };
  }
  // x = v t
  if (wantsDistance && vels.length && times.length) {
    return { value: vels[0] * times[0], unit: "m" };
  }
  // h = v²/(2g) — max height / cliff height from impact speed
  if (wantsHeight && vels.length) {
    return { value: (vels[0] * vels[0]) / (2 * G_ACC), unit: "m" };
  }
  // v = √(2Fd/m) — speed gained (or lost) when a force acts over a distance
  // ("pushed 10 m by a 20 N force" / "slides to a stop under 15 N of friction")
  if (wantsSpeed && forces.length && lengths.length && masses.length) {
    return { value: Math.sqrt((2 * forces[0] * lengths[0]) / masses[0]), unit: "m/s" };
  }
  // v = √(2gh) — impact speed from drop height
  if (wantsSpeed && lengths.length) {
    return { value: Math.sqrt(2 * G_ACC * lengths[0]), unit: "m/s" };
  }
  // generic fallbacks
  if (accs.length && times.length) {
    const v0 = vels[0] ?? 0;
    return { value: v0 * times[0] + 0.5 * accs[0] * times[0] * times[0], unit: "m" };
  }
  return { value: NaN, unit: "m/s" };
}

export const kinematics = { name: "kinematics", generate, solve };
