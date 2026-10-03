/**
 * Direct questions about the constants table.
 *
 * "What is g on Mars?", "How much does a 70 kg person weigh on the Moon?",
 * "What is the mass of Jupiter?" — these are lookups, not derivations, and
 * they used to fall through every solver circuit. Each answer names the
 * constants it used so the timeline can cite them.
 *
 * The patterns are deliberately narrow templates ("what is the mass of X"),
 * not keyword matches: a problem that *supplies* a planet's mass or radius
 * wants the circuits, not the table.
 */
import { constant, resolveWorldName, surfaceGravityId, valueOf, worldG, WORLDS } from "./constant-table";
import type { Constant } from "./constant-table";
import { takeAll } from "./extract";
import { tokenize } from "./tokenizer";

export interface ConstantAnswer {
  value: number;
  unit: string;
  /** the constant that answers the question */
  primary: Constant;
  /** supporting constants (e.g. R⊕ behind an escape velocity) */
  support: Constant[];
  /** how the number was produced, for the trace */
  how: string;
}

/** The question part of a problem: after the last "?" (or the last sentence). */
function questionOf(text: string): string {
  const q = text.lastIndexOf("?");
  if (q >= 0) return text.slice(0, q + 1);
  const parts = text.split(/(?<=[.!?])\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : text;
}

function need(id: string): Constant {
  const c = constant(id);
  if (!c) throw new Error(`missing constant ${id}`);
  return c;
}

const BODY_WORDS = "mercury|venus|earth|mars|jupiter|saturn|pluto|moon|luna";

/** Normalized body id for a word matched by a template, or undefined. */
function bodyId(word: string): string | undefined {
  const w = word.toLowerCase();
  return w === "luna" ? "moon" : w;
}

/**
 * Problems that *define* a body rather than ask about a known one — the table
 * must not answer a hypothetical world.
 */
const HYPOTHETICAL =
  /hypothetical|multiple of earth|\btimes earth'?s\b|\bif (?:it|the planet|the world) (?:had|were)\b|planet [qvxy]\b|\bnew (?:planet|world)\b/;

export function constantAnswer(text: string): ConstantAnswer | undefined {
  const lower = text.toLowerCase();
  const q = questionOf(lower);
  const { slots } = tokenize(text);
  const masses = takeAll(slots, "mass");
  const lengths = takeAll(slots, "length");

  // ── "what is the mass / radius / year of <body>?" ────────────────
  const attr = new RegExp(
    `\\b(?:what(?:'s| is)|how (?:long|much)(?:'s| is)?|find|give me the|` +
      `state the|determine the)\\s+(?:the\\s+|a\\s+|an\\s+)?` +
      `(mass|radius|diameter|year|orbital period|distance from the sun)\\s+` +
      `(?:of|on|around)\\s+(?:the\\s+)?(${BODY_WORDS}|sun)\\b`,
  ).exec(q);
  if (attr) {
    const what = attr[1];
    const name = bodyId(attr[2]) ?? "earth";
    if (name === "sun") {
      if (what === "mass") return { value: valueOf("M_sun"), unit: "kg", primary: need("M_sun"), support: [], how: "straight from the table" };
    } else {
      const w = name ? WORLDS[name] : undefined;
      if (w) {
        if (what === "mass")
          return { value: w.mass, unit: "kg", primary: need(`M_${name}`), support: [], how: "straight from the table" };
        if (what === "radius" || what === "diameter")
          return {
            value: what === "radius" ? w.radius : w.radius * 2,
            unit: "m",
            primary: need(`R_${name}`),
            support: [],
            how: what === "radius" ? "straight from the table" : "twice the tabulated radius",
          };
        if (what === "year" || what === "orbital period") {
          if (w.year !== undefined)
            return { value: w.year, unit: "s", primary: need(`T_${name}`), support: [], how: "orbital period from the table" };
        }
        if (what === "distance from the sun" && w.sunDistance !== undefined)
          return {
            value: w.sunDistance,
            unit: "m",
            primary: need(`d_${name}`),
            support: [],
            how: "mean distance from the Sun",
          };
      }
    }
  }

  if (HYPOTHETICAL.test(q) || HYPOTHETICAL.test(lower)) return undefined;

  const world = resolveWorldName(q) ?? resolveWorldName(lower);

  // ── "what is g on / at the surface of <body>?" ───────────────────
  // the body must sit right next to "gravity" — "the net force of gravity on
  // the Moon" is a force question, not a table lookup
  const asksG =
    /\b(?:what(?:'s| is)|how (?:strong|big|much) is|calculate|determine|find|compute)\b/.test(q) &&
    !/\bforce\b|\bweight\b|\bweightless\b|\bpull\b/.test(q) &&
    new RegExp(
      `\\b(?:g|gravity|gravitational acceleration|acceleration due to gravity)\\b\\s*` +
        `(?:on|at|over|for)\\s+(?:the\\s+)?(?:surface of\\s+)?(${BODY_WORDS})\\b`,
    ).exec(q);
  if (asksG && !masses.length && !lengths.length) {
    const name = bodyId(asksG[1]) ?? "earth";
    const w = WORLDS[name];
    if (w) {
      return {
        value: worldG(name),
        unit: "m/s²",
        primary: need(surfaceGravityId(name)),
        support: name === "earth" ? [] : [need(`M_${name}`), need(`R_${name}`)],
        how: name === "earth" ? "standard gravity near Earth's surface" : "g = GM/R²",
      };
    }
  }

  // ── "how much does a 70 kg person weigh on the Moon?" ────────────
  const weighs = new RegExp(`\\bweighs?\\b[^?]*\\b(?:on|at)\\s+(?:the\\s+)?(${BODY_WORDS})\\b`).exec(q);
  if (masses.length && (weighs || (/\bweighs?\b/.test(q) && world)) && !/same weight/.test(q)) {
    const name = bodyId(weighs?.[1] ?? world ?? "");
    // a mass in free fall or orbit has no weight to speak of — the circuits
    // know about orbits, the table does not
    if (!/\borbit|satellite|altitude|aboard|free fall|free-fall|iss\b/.test(lower)) {
      return {
        value: masses[0] * worldG(name),
        unit: "N",
        primary: need(name ? surfaceGravityId(name) : "g_std"),
        support: name && name !== "earth" ? [need(`M_${name}`), need(`R_${name}`)] : [],
        how: "W = mg",
      };
    }
  }

  // ── the constants themselves ─────────────────────────────────────
  // "value of G" and "value of g" are the same word in lower case, so the
  // upper-case spelling a student writes is the tie-breaker
  if (/\bgravitational constant\b/.test(q) || /\b(?:value of|what is|what's)\s+G\b/.test(text))
    return { value: valueOf("G"), unit: "N·m²/kg²", primary: need("G"), support: [], how: "straight from the table" };
  if (/\bcoulomb'?s? constant\b/.test(q))
    return { value: valueOf("K_E"), unit: "N·m²/C²", primary: need("K_E"), support: [], how: "straight from the table" };
  if (/\belementary charge\b|\bcharge of (?:an electron|a proton)\b/.test(q))
    return { value: valueOf("E_CHARGE"), unit: "C", primary: need("E_CHARGE"), support: [], how: "straight from the table" };
  if (
    /\b(?:value of|what is the value of|what is)\s+(?:standard )?g\b|\bacceleration due to gravity near earth'?s? surface\b/.test(q) &&
    !world &&
    !/\b(?:value of|what is|what's)\s+G\b/.test(text)
  )
    return { value: valueOf("g_std"), unit: "m/s²", primary: need("g_std"), support: [], how: "standard gravity" };
  if (/\bhow far is (?:the )?earth from the sun\b|\bearth-?sun distance\b/.test(q))
    return {
      value: valueOf("d_earth_sun"),
      unit: "m",
      primary: need("d_earth_sun"),
      support: [],
      how: "straight from the table",
    };

  // ── derived velocities for a body in the table ───────────────────
  const body = world ?? "earth";
  const w = WORLDS[body];
  if (w && !masses.length && !lengths.length) {
    if (/\bescape (?:speed|velocity)\b/.test(q)) {
      return {
        value: Math.sqrt(2 * worldG(body) * w.radius),
        unit: "m/s",
        primary: need(`R_${body}`),
        support: [need(`M_${body}`), need("G")],
        how: "v_escape = √(2GM/R) = √(2gR)",
      };
    }
    const orbitQ = new RegExp(`\\borbital (?:speed|velocity)\\b[^?]*\\b(${BODY_WORDS})\\b`).exec(q);
    if (orbitQ) {
      const name = bodyId(orbitQ[1]);
      const b = name ? WORLDS[name] : undefined;
      const r = b && /\bsurface\b/.test(q) ? b.radius : b?.sunDistance;
      if (b && r !== undefined) {
        return {
          value: Math.sqrt((valueOf("G") * valueOf("M_sun")) / r),
          unit: "m/s",
          primary: need(`M_sun`),
          support: [need("G")],
          how: /\bsurface\b/.test(q) ? "v = √(GM⊕/R⊕) at the surface" : "v = √(G☉/r) about the Sun",
        };
      }
    }
  }

  return undefined;
}
