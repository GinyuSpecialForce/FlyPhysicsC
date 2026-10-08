/**
 * The constants table — the one place the fly's numbers come from.
 *
 * Everything downstream (the 12 solver circuits, the answer citations, the
 * Reference tab) reads from `CONSTANTS`. `constants.ts` re-exports the named
 * bindings from here so existing circuits keep working untouched, and the
 * tests pin to the same values that were hardcoded before.
 *
 * Values are the standard AP Physics C intro-course constants (SI, 3 s.f.).
 */
import type { Topic } from "./features";

const SUPER_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/** Superscript an integer: -11 → ⁻¹¹ */
function sup(n: number): string {
  return String(n)
    .split("")
    .map((c) => (c === "-" ? "⁻" : (SUPER_DIGITS[Number(c)] ?? c)))
    .join("");
}

export interface Constant {
  /** stable id, e.g. "G", "M_earth", "g_mars" */
  id: string;
  /** printed symbol, e.g. "G", "M⊕" */
  symbol: string;
  /** spelled-out name for the Reference tab */
  name: string;
  value: number;
  /** SI unit of `value` */
  unit: string;
  /** how it reads on a reference sheet: "6.67 × 10⁻¹¹ N·m²/kg²" */
  display: string;
  /** which circuits may cite it */
  topics: Topic[];
  /** phrasings in a problem that name this constant */
  aliases: string[];
  /** set when the value is computed from other constants (g = GM/R²) */
  derived?: string;
  /** table grouping for the Reference tab */
  group: "universal" | "earth-moon-sun" | "planets" | "electromagnetic" | "other";
}

const ALL: Topic[] = [
  "kinematics",
  "newton",
  "energy",
  "momentum",
  "rotation",
  "shm",
  "gravitation",
  "electrostatics",
  "capacitors",
  "circuits",
  "magnetism",
  "induction",
];

const MECH: Topic[] = ["newton", "energy", "momentum", "rotation", "shm", "gravitation", "kinematics"];
const GRAV: Topic[] = ["gravitation", "shm"];

/**
 * Planet bodies: mass + radius are needed for surface gravity (g = GM/R²) and
 * for any Kepler question. Orbital distance/period let the fly answer "how
 * long is a year on Mars" from the same table.
 */
export interface WorldBody {
  mass: number; // kg
  radius: number; // m
  /** mean distance from the Sun, m (undefined for the Moon) */
  sunDistance?: number;
  /** sidereal orbital period about the Sun, s (undefined for the Moon) */
  year?: number;
}

const WORLD_SPEC: Array<[string, WorldBody]> = [
  ["mercury", { mass: 3.301e23, radius: 2.4397e6, sunDistance: 5.79e10, year: 2.21e7 }],
  ["venus", { mass: 4.867e24, radius: 6.0518e6, sunDistance: 1.08e11, year: 1.99e7 }],
  ["earth", { mass: 5.97e24, radius: 6.37e6, sunDistance: 1.496e11, year: 3.156e7 }],
  ["mars", { mass: 6.417e23, radius: 3.3895e6, sunDistance: 2.28e11, year: 5.94e7 }],
  ["jupiter", { mass: 1.898e27, radius: 7.1492e7, sunDistance: 7.78e11, year: 3.74e8 }],
  ["saturn", { mass: 5.683e26, radius: 6.0268e7, sunDistance: 1.43e12, year: 9.29e8 }],
  ["pluto", { mass: 1.303e22, radius: 1.1883e6 }],
  ["moon", { mass: 7.342e22, radius: 1.7374e6 }],
];

export const WORLDS: Record<string, WorldBody> = Object.fromEntries(
  WORLD_SPEC.map(([name, body]) => [name, body]),
);

/** Every named body including Earth (used for "g on Mars", "weight on Earth"). */
export const ALL_WORLDS: Record<string, WorldBody> = WORLDS;

/** Gravity G is needed to derive surface g before the table is built. */
const G0 = 6.67e-11;

const WORLD_LABELS: Record<string, { label: string; aliases: string[] }> = {
  mercury: { label: "Mercury", aliases: ["mercury"] },
  venus: { label: "Venus", aliases: ["venus"] },
  earth: { label: "Earth", aliases: ["earth", "earth's", "the earth"] },
  mars: { label: "Mars", aliases: ["mars", "mars's"] },
  jupiter: { label: "Jupiter", aliases: ["jupiter", "jupiter's"] },
  saturn: { label: "Saturn", aliases: ["saturn", "saturn's"] },
  pluto: { label: "Pluto", aliases: ["pluto"] },
  moon: { label: "the Moon", aliases: ["moon", "the moon", "luna"] },
};

function worldConstants(): Constant[] {
  const out: Constant[] = [];
  for (const [name, w] of Object.entries(WORLDS)) {
    const label = WORLD_LABELS[name]?.label ?? name;
    // Earth's mass, radius and g already have their canonical entries above,
    // and so does the Moon's mass
    const skipMass = name === "earth" || name === "moon";
    if (!skipMass) {
      out.push({
        id: `M_${name}`,
        symbol: `M(${label})`,
        name: `${label} mass`,
        value: w.mass,
        unit: "kg",
        display: `${sci(w.mass)} kg`,
        topics: GRAV,
        aliases: [`${label.toLowerCase()}'s mass`, `mass of ${label.toLowerCase()}`],
        group: "planets",
      });
    }
    if (name !== "earth") {
      out.push({
        id: `R_${name}`,
        symbol: `R(${label})`,
        name: `${label} radius`,
        value: w.radius,
        unit: "m",
        display: `${sci(w.radius)} m`,
        topics: GRAV,
        aliases: [`${label.toLowerCase()}'s radius`, `radius of ${label.toLowerCase()}`],
        group: name === "moon" ? "earth-moon-sun" : "planets",
      });
    }
    if (name !== "earth") {
      out.push({
        id: `g_${name}`,
        symbol: `g(${label})`,
        name: `${label} surface gravity`,
        value: (G0 * w.mass) / (w.radius * w.radius),
        unit: "m/s²",
        display: `${round3((G0 * w.mass) / (w.radius * w.radius))} m/s²`,
        topics: GRAV,
        aliases: [`gravity on ${label.toLowerCase()}`, `g on ${label.toLowerCase()}`],
        derived: "g = GM/R²",
        group: name === "moon" ? "earth-moon-sun" : "planets",
      });
    }
    if (w.sunDistance !== undefined) {
      out.push({
        id: `d_${name}`,
        symbol: `d(${label})`,
        name: `${label} distance from the Sun`,
        value: w.sunDistance,
        unit: "m",
        display: `${sci(w.sunDistance)} m`,
        topics: GRAV,
        aliases: [`${label.toLowerCase()} from the sun`, `distance from the sun to ${label.toLowerCase()}`],
        group: name === "earth" ? "earth-moon-sun" : "planets",
      });
    }
    if (w.year !== undefined) {
      out.push({
        id: `T_${name}`,
        symbol: `T(${label})`,
        name: `${label} orbital period`,
        value: w.year,
        unit: "s",
        display: `${sci(w.year)} s`,
        topics: GRAV,
        aliases: [`year on ${label.toLowerCase()}`, `${label.toLowerCase()}'s year`],
        group: name === "earth" ? "earth-moon-sun" : "planets",
      });
    }
  }
  return out;
}

export const CONSTANTS: Constant[] = [
  {
    id: "G",
    symbol: "G",
    name: "universal gravitational constant",
    value: G0,
    unit: "N·m²/kg²",
    display: "6.67 × 10⁻¹¹ N·m²/kg²",
    topics: GRAV,
    aliases: ["gravitational constant", "universal gravitation", "newton's constant", "g = 6.67"],
    group: "universal",
  },
  {
    id: "g_std",
    symbol: "g",
    name: "acceleration due to gravity near Earth's surface",
    value: 9.8,
    unit: "m/s²",
    display: "9.8 m/s²",
    topics: MECH,
    aliases: ["acceleration due to gravity", "standard gravity", "gravitational acceleration", "gravity near earth's surface"],
    group: "universal",
  },
  {
    id: "M_earth",
    symbol: "M⊕",
    name: "mass of Earth",
    value: 5.97e24,
    unit: "kg",
    display: "5.97 × 10²⁴ kg",
    topics: GRAV,
    aliases: ["earth's mass", "mass of the earth", "mass of earth"],
    group: "earth-moon-sun",
  },
  {
    id: "R_earth",
    symbol: "R⊕",
    name: "radius of Earth",
    value: 6.37e6,
    unit: "m",
    display: "6.37 × 10⁶ m",
    topics: GRAV,
    aliases: ["earth's radius", "radius of the earth", "radius of earth", "earth radii"],
    group: "earth-moon-sun",
  },
  {
    id: "M_sun",
    symbol: "M☉",
    name: "mass of the Sun",
    value: 1.989e30,
    unit: "kg",
    display: "1.99 × 10³⁰ kg",
    topics: GRAV,
    aliases: ["sun's mass", "mass of the sun", "solar mass", "suns"],
    group: "earth-moon-sun",
  },
  {
    id: "d_earth_sun",
    symbol: "d(⊕–☉)",
    name: "Earth–Sun distance",
    value: 1.496e11,
    unit: "m",
    display: "1.50 × 10¹¹ m",
    topics: GRAV,
    aliases: ["earth-sun distance", "distance from the earth to the sun", "distance from earth to the sun", "one astronomical unit", "earth's orbit around the sun"],
    group: "earth-moon-sun",
  },
  {
    id: "M_moon",
    symbol: "M☾",
    name: "mass of the Moon",
    value: 7.342e22,
    unit: "kg",
    display: "7.35 × 10²² kg",
    topics: GRAV,
    aliases: ["moon's mass", "mass of the moon"],
    group: "earth-moon-sun",
  },
  {
    id: "d_moon",
    symbol: "d(⊕–☾)",
    name: "Earth–Moon distance",
    value: 3.844e8,
    unit: "m",
    display: "3.84 × 10⁸ m",
    topics: GRAV,
    aliases: ["earth-moon distance", "distance from the earth to the moon", "distance between the earth and the moon", "the moon's orbit"],
    group: "earth-moon-sun",
  },
  {
    id: "K_E",
    symbol: "kₑ",
    name: "Coulomb's constant",
    value: 8.99e9,
    unit: "N·m²/C²",
    display: "8.99 × 10⁹ N·m²/C²",
    topics: ["electrostatics", "circuits"],
    aliases: ["coulomb's constant", "coulomb constant", "k = 8.99", "electrostatic constant"],
    group: "electromagnetic",
  },
  {
    id: "EPS0",
    symbol: "ε₀",
    name: "permittivity of free space",
    value: 8.85e-12,
    unit: "F/m",
    display: "8.85 × 10⁻¹² F/m",
    topics: ["electrostatics", "capacitors"],
    aliases: ["permittivity", "epsilon"],
    group: "electromagnetic",
  },
  {
    id: "MU0",
    symbol: "μ₀",
    name: "permeability of free space",
    value: 4 * Math.PI * 1e-7,
    unit: "T·m/A",
    display: "4π × 10⁻⁷ T·m/A",
    topics: ["magnetism", "induction"],
    aliases: ["permeability", "mu naught", "mu0"],
    group: "electromagnetic",
  },
  {
    id: "E_CHARGE",
    symbol: "e",
    name: "elementary charge",
    value: 1.6e-19,
    unit: "C",
    display: "1.60 × 10⁻¹⁹ C",
    topics: ["electrostatics", "magnetism", "circuits", "induction"],
    aliases: ["elementary charge", "charge of an electron", "charge of a proton", "electron charge"],
    group: "electromagnetic",
  },
  {
    id: "EV",
    symbol: "1 eV",
    name: "electron volt in joules",
    value: 1.602e-19,
    unit: "J",
    display: "1.60 × 10⁻¹⁹ J",
    topics: ALL,
    aliases: ["electron volt", "ev in joules", "1 ev"],
    derived: "e × 1 V",
    group: "other",
  },
  {
    id: "RHO_WATER",
    symbol: "ρ(water)",
    name: "density of water",
    value: 1.0e3,
    unit: "kg/m³",
    display: "1.00 × 10³ kg/m³",
    topics: ALL,
    aliases: ["density of water", "water density"],
    group: "other",
  },
  {
    id: "C_LIGHT",
    symbol: "c",
    name: "speed of light",
    value: 3.0e8,
    unit: "m/s",
    display: "3.00 × 10⁸ m/s",
    topics: ALL,
    aliases: ["speed of light"],
    group: "other",
  },
];

// world constants (mercury → moon) come after the hand-written entries
const TABLE: Constant[] = [...CONSTANTS, ...worldConstants()];

const BY_ID = new Map(TABLE.map((c) => [c.id, c]));

/** Look up a constant by id. */
export function constant(id: string): Constant | undefined {
  return BY_ID.get(id);
}

/** The id of a body's surface gravity — Earth uses the standard-g entry. */
export function surfaceGravityId(body: string): string {
  return body === "earth" ? "g_std" : `g_${body}`;
}

/** Value of a constant by id (throws for typos, which are programmer errors). */
export function valueOf(id: string): number {
  const c = BY_ID.get(id);
  if (!c) throw new Error(`unknown constant: ${id}`);
  return c.value;
}

/**
 * Which body the text names, by id.
 *
 * Earth is the fallback, never the winner: a problem that says "900 N on
 * earth … the same weight on Pluto?" is about Pluto. Ties among real bodies go
 * to the longer alias ("the moon" over "moon"), then to registry order.
 */
export function resolveWorldName(text: string): string | undefined {
  const t = text.toLowerCase();
  const hits: Array<{ name: string; len: number }> = [];
  for (const [name, labels] of Object.entries(WORLD_LABELS)) {
    for (const alias of labels.aliases) {
      if (t.includes(alias)) hits.push({ name, len: alias.length });
    }
  }
  const real = hits.filter((h) => h.name !== "earth");
  const pool = real.length ? real : hits;
  let best = pool[0];
  for (const h of pool.slice(1)) if (h.len > best.len) best = h;
  return best?.name;
}

/** The body the text names (Earth included), or undefined. */
export function resolveWorld(text: string): WorldBody | undefined {
  const name = resolveWorldName(text);
  return name ? WORLDS[name] : undefined;
}

/**
 * Surface gravity of a named body. Earth returns the AP value 9.8 rather than
 * GM/R² (9.798) so printed answers match a student's table exactly.
 */
export function worldG(name: string | undefined): number {
  if (!name) return valueOf("g_std");
  if (name === "earth") return valueOf("g_std");
  const w = WORLDS[name];
  return w ? (valueOf("G") * w.mass) / (w.radius * w.radius) : valueOf("g_std");
}

/** Surface gravity of whichever body the text names, else Earth's. */
export function worldGravity(text: string): number {
  return worldG(resolveWorldName(text));
}

/** Every constant in the table (Reference tab). */
export function allConstants(): Constant[] {
  return TABLE;
}

// ── implied constants ───────────────────────────────────────────────

export interface SuppliedConstant {
  constant: Constant;
  /** why the fly thinks this applies, shown in the trace */
  reason: string;
}

/**
 * Constants the fly is entitled to assume from the phrasing alone — "at the
 * surface of Mars", "near Earth's surface", "the Sun's pull". This is what
 * stops every solver from hardcoding its own defaults, and it is what the
 * compute-stage trace cites.
 */
export function suppliedConstants(text: string): SuppliedConstant[] {
  const t = text.toLowerCase();
  const out: SuppliedConstant[] = [];
  const seen = new Set<string>();
  const push = (id: string, reason: string) => {
    const c = BY_ID.get(id);
    if (!c || seen.has(id)) return;
    seen.add(id);
    out.push({ constant: c, reason });
  };

  const world = resolveWorldName(text);
  if (world) {
    const label = `${WORLD_LABELS[world]?.label ?? world} is the body in play`;
    push(`M_${world}`, label);
    push(`R_${world}`, label);
    push(surfaceGravityId(world), label);
  }
  if (/earth|surface|weight|weigh/.test(t)) push("g_std", "no acceleration given, standard gravity");
  // keep the trace short: a named body outranks a generic g
  if (
    /\borbit|satellit|kepler|gravit|escape velocity|period of the (?:orbit|year)|revolut|weighs? on|weight on (?:the )?(?:moon|mars|planet|jupiter)/.test(
      t,
    )
  ) {
    push("M_earth", "orbit/gravity problem with no central mass given");
    push("R_earth", "orbit/gravity problem with no radius given");
    push("G", "orbit/gravity problem with no constant given");
  }
  if (/\bsun\b|\bsolar\b/.test(t)) push("M_sun", "the Sun is in play");
  if (/moon/.test(t)) {
    push("d_moon", "the Moon is in play");
    push("M_moon", "the Moon is in play");
  }

  // constants named outright in the problem
  for (const c of TABLE) {
    if (out.some((o) => o.constant.id === c.id)) continue;
    for (const alias of c.aliases) {
      if (t.includes(alias)) {
        push(c.id, `problem names it`);
        break;
      }
    }
  }
  return out;
}

// ── display helpers ─────────────────────────────────────────────────

/** "5.97 × 10²⁴" — 3 significant figures, AP sheet style. */
function sci(x: number): string {
  if (x === 0) return "0";
  const exp = Math.floor(Math.log10(Math.abs(x)));
  if (exp >= -2 && exp < 4) return trimZeros(x.toPrecision(3));
  const mant = x / 10 ** exp;
  return `${trimZeros(mant.toPrecision(3))} × 10${sup(exp)}`;
}

function round3(x: number): string {
  return trimZeros(x.toPrecision(3));
}

function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}
