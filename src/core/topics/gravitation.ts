/**
 * Gravitation — F = Gm₁m₂/r², orbital v = √(GM/r), surface gravity, named
 * worlds (g = GM/R²), Kepler's 3rd law (M = 4π²a³/GT²), orbit mechanics,
 * and the unit's concept questions (answered by a phrase).
 */
import { buildChoices } from "./distractors";
import { takeAll } from "../extract";
import type { SolveCtx } from "../extract";
import {
  G,
  G_ACC,
  MOON_DIST,
  MOON_MASS,
  SUN_MASS,
  EARTH_SUN_DIST,
} from "../constants";
import { worldGravity } from "../constant-table";
import { M_EARTH, R_EARTH } from "../earth";
import type { Rng } from "../rng";
import type { BuiltProblem } from "./distractors";

export function generate(rng: Rng): BuiltProblem {
  const kind = rng.int(0, 1);

  if (kind === 0) {
    const massRatio = rng.pick([0.5, 0.8, 2, 3, 5]);
    const radiusRatio = rng.pick([0.5, 0.7, 1, 2, 2.5]);
    // use the same constants the solver will use, so round-trip matches
    const gEarth = (G * M_EARTH) / (R_EARTH * R_EARTH);
    const gSurf = (massRatio / radiusRatio ** 2) * gEarth;
    const scenario = `A planet has ${massRatio}× Earth's mass and ${radiusRatio}× Earth's radius. What is g at its surface?`;
    const sol = `g = GM/r² = (${massRatio}/${radiusRatio}²) × 9.8`;
    return buildChoices(
      { value: gSurf, unit: "m/s²" },
      [
        (G_ACC * massRatio) / radiusRatio,
        G_ACC * massRatio * radiusRatio ** 2,
        G_ACC / radiusRatio,
        gSurf * radiusRatio,
      ],
      rng,
      scenario,
      sol,
    );
  }

  const orbitRadii = rng.pick([2, 3, 4, 5]);
  const r = orbitRadii * R_EARTH;
  const v = Math.sqrt((G * M_EARTH) / r);
  const scenario = `A satellite orbits Earth at a radius of ${orbitRadii} Earth radii from Earth's center. What is its orbital speed?`;
  const sol = `v = √(GM/r) with r = ${orbitRadii}R⊕`;
  return buildChoices(
    { value: v, unit: "m/s" },
    [
      Math.sqrt((G * M_EARTH) / R_EARTH),
      v * 2,
      v / 2,
      Math.sqrt((G * M_EARTH) / (r * r)),
    ],
    rng,
    scenario,
    sol,
  );
}

/** Express a g-multiple as the eval bank's concept phrasing. */
function gMultipleConcept(m: number): string {
  if (m === 1) return "g⊕";
  if (Number.isInteger(m) && m >= 2) return `${m}g`;
  const inv = 1 / m;
  if (Number.isInteger(inv)) return `g⊕/${inv}`;
  return `${m}g⊕`;
}

/** Surface gravity of a world body. */
function gOf(mass: number, radius: number): number {
  return (G * mass) / (radius * radius);
}

/** Word multipliers used by the hypothetical-worlds field questions. */
const WORD_NUM: Record<string, number> = {
  twice: 2, thrice: 3, double: 2,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, twelve: 12, twenty: 20, hundred: 100, thousand: 1000,
  half: 0.5, quarter: 0.25, third: 1 / 3, fourth: 0.25, fifth: 0.2,
  tenth: 0.1, twentieth: 0.05, hundredth: 0.01,
};

/** "twice" / "one tenth" / "ten times" / "2.5 times" → numeric multiplier. */
function wordMultiplier(phrase: string): number | undefined {
  const parts = phrase
    .toLowerCase()
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter((w) => w && w !== "times" && w !== "time");
  if (!parts.length) return undefined;
  let prod = 1;
  for (const w of parts) {
    if (w in WORD_NUM) prod *= WORD_NUM[w];
    else if (/^[\d.]+$/.test(w)) prod *= parseFloat(w);
    else return undefined;
  }
  return prod;
}

/**
 * "Planet Q: twice Earth's mass, twice Earth's diameter" → g as a multiple
 * of Earth's. g ∝ M/R² for mass phrasings, g ∝ ρ·R for density phrasings.
 */
function hypotheticalWorldG(t: string): number | undefined {
  if (!/multiple of earth|hypothetical world/.test(t)) return undefined;
  let massM: number | undefined;
  let densM: number | undefined;
  let radM = 1;
  for (const m of t.matchAll(
    /([a-z]+(?:[ -][a-z]+)*)\s*(?:times\s+)?earth(?:'s)?\s+(mass|density|radius|diameter)/g,
  )) {
    const mult = wordMultiplier(m[1]);
    if (mult === undefined) continue;
    if (m[2] === "mass") massM = mult;
    else if (m[2] === "density") densM = mult;
    else radM = mult;
  }
  if (massM === undefined && densM === undefined && radM === 1) return undefined;
  if (massM !== undefined) return massM / (radM * radM);
  if (densM !== undefined) return densM * radM;
  return 1 / (radM * radM);
}

/**
 * "Planet A has speed v and planet B has speed 3v" → orbital ratios:
 * r ∝ 1/v² and T ∝ r^1.5, as A:B.
 */
function planetRatios(t: string): { r: number; period: number } | undefined {
  const speeds = [...t.matchAll(/speed\s+(?:of\s+)?(\d+(?:\.\d+)?)?\s*v\b/g)].map(
    (m) => (m[1] ? parseFloat(m[1]) : 1),
  );
  if (speeds.length < 2 || !/ratio/.test(t)) return undefined;
  const rr = (speeds[1] / speeds[0]) ** 2;
  return { r: rr, period: rr ** 1.5 };
}

/** "23 hours 56 minutes 4.0 seconds" → seconds. */
function parseHMS(t: string): number | undefined {
  const m = /(\d+)\s*hours?\s*(\d+)\s*minutes?\s*([\d.]+)\s*seconds?/.exec(t);
  return m ? parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]) : undefined;
}

/** "2.0 times greater" diameter ratio (mass ratio is its cube at equal density). */
function sizeRatio(t: string): number {
  const m = /(\d+(?:\.\d+)?)\s*times\s+(?:greater|larger|bigger|more)/.exec(t);
  return m ? parseFloat(m[1]) : 1;
}

export function solve(ctx: SolveCtx): {
  value: number;
  unit: string;
  concept?: string;
} {
  const masses = takeAll(ctx.slots, "mass");
  const lengths = takeAll(ctx.slots, "length");
  const accs = takeAll(ctx.slots, "acceleration");
  const vels = takeAll(ctx.slots, "velocity");
  const times = takeAll(ctx.slots, "time");
  const forces = takeAll(ctx.slots, "force");
  const t = ctx.text.toLowerCase();
  // the named body (Pluto in "900 N on earth … same weight on Pluto"), and the
  // surface gravity it implies — Earth's is the AP 9.8, not GM/R²
  const gWorld = worldGravity(t);

  // ── unit concepts ───────────────────────────────────────────────
  if (/compared to a surface orbit|compared to/.test(t)) {
    return { value: NaN, unit: "concept", concept: "v₀/√2" };
  }
  if (/one-quarter|one-quarter its|drops to one/.test(t)) {
    return { value: NaN, unit: "concept", concept: "2R⊕" };
  }
  if (/what other purpose do the rocket engines|initiate an orbit|besides lifting/.test(t)) {
    return {
      value: NaN,
      unit: "concept",
      concept: "sideways (tangential) speed — orbiting is free fall with enough horizontal velocity",
    };
  }
  if (/direction should .*rockets fire|leave orbit and return/.test(t)) {
    return {
      value: NaN,
      unit: "concept",
      concept: "retrograde — fire against the motion to lose speed and descend",
    };
  }
  if (/floats? about|why (?:does|do) .*float|astronaut floats|weightless/.test(t)) {
    return {
      value: NaN,
      unit: "concept",
      concept: "free fall — the shuttle and astronaut fall together (normal force ≈ 0)",
    };
  }
  if (/possible for the moon to (?:continue )?orbit|moon to continue orbiting/.test(t)) {
    return {
      value: NaN,
      unit: "concept",
      concept: "the sun's pull is nearly uniform on Earth and Moon — only its difference (tides) matters",
    };
  }
  if (/bench press this mass|just like he did/.test(t)) {
    return {
      value: NaN,
      unit: "concept",
      concept: "No — same weight, but the mass (inertia) is far greater",
    };
  }
  if (/how these values can be so close|although mars is much larger/.test(t)) {
    return {
      value: NaN,
      unit: "concept",
      concept: "Mars' larger mass offsets its larger radius (g = GM/R²)",
    };
  }
  if (/inside the earth|inside an empty spherical shell/.test(t)) {
    return {
      value: NaN,
      unit: "concept",
      concept: "g = g⊕·(r/R⊕) — grows linearly to the surface",
    };
  }
  if (/determine the slope|find the slope|what is the slope/.test(t)) {
    return { value: NaN, unit: "concept", concept: "slope = GM/4π²" };
  }
  if (/what graph|straight line/.test(t)) {
    return { value: NaN, unit: "concept", concept: "r³ vs. T²" };
  }

  // hypothetical worlds: g as a multiple of Earth's
  const gMult = hypotheticalWorldG(t);
  if (gMult !== undefined) {
    return { value: NaN, unit: "concept", concept: gMultipleConcept(gMult) };
  }

  // two planets at speeds v and 3v: radii and period ratios
  const ratios = planetRatios(t);
  if (ratios) {
    const r = /period/.test(t) ? ratios.period : ratios.r;
    return { value: NaN, unit: "concept", concept: `${Math.round(r)}:1` };
  }

  if (/(radius were|gravity would|gravity is)/.test(t) && /Earth/.test(ctx.text)) {
    const mM = /([\d.]+)\s*×\s*Earth(?:'?s)?\s+mass/i.exec(ctx.text);
    const rR = /([\d.]+)\s*×\s*Earth(?:'?s)?\s+radius/i.exec(ctx.text);
    const halved = /halved/.test(t);
    const mr = mM ? parseFloat(mM[1]) : 1;
    const rr = halved ? 0.5 : rR ? parseFloat(rR[1]) : 1;
    return { value: NaN, unit: "concept", concept: gMultipleConcept(mr / rr ** 2) };
  }

  // ── Kepler's 3rd law: central mass M = 4π²a³/(GT²) ──────────────
  const keplerish = /semi-major|binary|orbiting one another|elliptical orbit/.test(t);
  if (keplerish && lengths.length && times.length) {
    const a = lengths[0];
    const T = times[0];
    const Mtot = (4 * Math.PI ** 2 * a ** 3) / (G * T * T);
    if (/times more massive/.test(t)) return { value: Mtot / SUN_MASS, unit: "suns" };
    const d = sizeRatio(t); // larger:smaller diameter → mass ratio d³ at equal density
    const wantSmaller = /of the smaller|smaller object|smaller body|smaller one/.test(t);
    if (/speed/.test(t) && wantSmaller) {
      const rSmall = (a * d ** 3) / (1 + d ** 3);
      return { value: (2 * Math.PI * rSmall) / T, unit: "m/s" };
    }
    if (wantSmaller) return { value: Mtot / (1 + d ** 3), unit: "kg" };
    return { value: Mtot, unit: "kg" };
  }

  // ── geosynchronous orbit ────────────────────────────────────────
  if (/geosynchronous|geostationary|in sync with the surface/.test(t)) {
    const T = parseHMS(t) ?? 86164;
    const r = Math.cbrt((G * M_EARTH * T * T) / (4 * Math.PI ** 2));
    if (/speed|inject/.test(t)) return { value: Math.sqrt((G * M_EARTH) / r), unit: "m/s" };
    return { value: r - R_EARTH, unit: "m" };
  }

  // ── tidal force across Earth from the Moon ──────────────────────
  if (/tidal|indian ocean|pacific/.test(t)) {
    const d = MOON_DIST;
    const dG = G * MOON_MASS * (1 / (d - R_EARTH) ** 2 - 1 / (d + R_EARTH) ** 2);
    if (/move apart|apart in|surfaces (?:would|will) move/.test(t)) {
      const secs = times[0] ?? (/hour/.test(t) ? 3600 : 86400);
      return { value: 0.5 * dG * secs * secs, unit: "m" };
    }
    return { value: dG, unit: "m/s²" };
  }

  // ── Earth–Moon: field at a point, and the L1 balance point ──────
  if (/halfway between/.test(t) && /moon/.test(t) && /accelerat/.test(t)) {
    return { value: gOf(M_EARTH - MOON_MASS, MOON_DIST / 2), unit: "m/s²" };
  }
  if (/stops losing speed|starts gaining speed/.test(t) && /moon/.test(t)) {
    const k = Math.sqrt(M_EARTH / MOON_MASS);
    return { value: (MOON_DIST * k) / (1 + k), unit: "m" }; // from Earth
  }

  // ── Moon between Earth and Sun: net gravitational force ─────────
  if (/net force of gravity on the moon|directly between the earth and the sun/.test(t)) {
    const aSun = (G * SUN_MASS) / (EARTH_SUN_DIST - MOON_DIST) ** 2;
    const aEarth = (G * M_EARTH) / MOON_DIST ** 2;
    return { value: MOON_MASS * Math.abs(aSun - aEarth), unit: "N" };
  }

  // ── altitude where g takes a given value: r = √(GM/g) ───────────
  if (/at what altitude|altitude (?:above|where)/.test(t) && accs.length) {
    return { value: Math.sqrt((G * M_EARTH) / accs[0]) - R_EARTH, unit: "m" };
  }

  // ── shuttle-style orbit questions at a known altitude ───────────
  const rAlt = lengths.length ? R_EARTH + lengths[0] : R_EARTH;
  if (lengths.length && /g (?:at|for) (?:this|that) altitude|value of g/.test(t)) {
    return { value: gOf(M_EARTH, rAlt), unit: "m/s²" };
  }
  if (lengths.length && /period of the orbit|period of this orbit|period of its orbit/.test(t)) {
    return { value: 2 * Math.PI * Math.sqrt(rAlt ** 3 / (G * M_EARTH)), unit: "s" };
  }

  // ── force of gravity on a mass, in orbit or on a named world ────
  if (/pull of gravity|force of .*gravity|gravity acting on/.test(t) && masses.length) {
    if (/orbit|altitude|aboard/.test(t) && lengths.length) {
      return { value: (masses[0] * G * M_EARTH) / (rAlt * rAlt), unit: "N" };
    }
    if (/\bmars|mercury|venus|jupiter|saturn|pluto|moon\b/.test(t)) {
      return { value: masses[0] * gWorld, unit: "N" };
    }
  }

  // ── "what mass would have the same weight on Pluto?" ────────────
  if (/mass (?:would|could|does) have the same weight|mass .* same weight/.test(t) && forces.length) {
    return { value: forces[0] / gWorld, unit: "kg" };
  }

  // weight W = mg (g defaults to Earth surface gravity when not stated)
  if (/weight/.test(t) && masses.length) {
    const g = accs[0] ?? gWorld;
    return { value: masses[0] * g, unit: "N" };
  }

  // orbital speed: v = √(GM/r) — r is the orbital radius, or the altitude
  // above the surface ("300 km") which needs Earth's radius added
  if (/orbit|satellite/.test(t) && lengths.length && /speed|velocity|how fast|inject/.test(t)) {
    const r = /altitude|above the surface|above earth/.test(t) ? R_EARTH + lengths[0] : lengths[0];
    return { value: Math.sqrt((G * M_EARTH) / r), unit: "m/s" };
  }

  // a satellite known by its speed alone: r = GM/v², T = 2πr/v
  if (vels.length && !lengths.length && /orbit|satellite/.test(t)) {
    const r = (G * M_EARTH) / (vels[0] * vels[0]);
    if (/altitude/.test(t)) return { value: r - R_EARTH, unit: "m" };
    if (/per day|revolutions?/.test(t)) {
      return { value: 86400 / ((2 * Math.PI * r) / vels[0]), unit: "rev/day" };
    }
  }

  // F = Gm₁m₂/r² (two masses, or one doubled: "two 1000 kg masses")
  if (/force between|gravitational force|exerts on the other/.test(t) && masses.length && lengths.length) {
    const m1 = masses[0];
    const m2 = masses.length >= 2 ? masses[1] : masses[0];
    return {
      value: (G * m1 * m2) / (lengths[0] * lengths[0]),
      unit: "N",
    };
  }
  // quadrupling the force halves the separation
  if (/quadrupl/.test(t) && lengths.length) {
    return { value: lengths[0] / 2, unit: "m" };
  }
  // named-world surface gravity ("calculate g for the surface of Mercury")
  if (gWorld !== G_ACC && /surface/.test(t) && /\bg\b/.test(t)) {
    return { value: gWorld, unit: "m/s²" };
  }
  // surface gravity g = GM/r² — only for actual world-surface problems; a
  // bare mass + radius pair must never answer, say, a sling's acceleration
  if (masses.length && lengths.length && /planet|moon|star|surface|orbit|satellite|escape/.test(t)) {
    return { value: (G * masses[0]) / (lengths[0] * lengths[0]), unit: "m/s²" };
  }
  return { value: NaN, unit: "m/s²" };
}

export const gravitation = { name: "gravitation", generate, solve };
