/**
 * Shared topic list and slot→feature mapping. The tokenizer extracts slots;
 * this module turns them into the numeric vector the network consumes.
 */

export const TOPICS = [
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
] as const;

export type Topic = (typeof TOPICS)[number];

export const TOPIC_LIST: readonly Topic[] = TOPICS;

/** A quantity the tokenizer found in the problem text. */
export interface Slot {
  /** normalized unit key, e.g. "m", "m/s", "N", "kg", "rad/s" */
  unit: string;
  value: number;
  /** raw text span, for display */
  text: string;
}

/** What the tokenizer + labeler produce for one problem. */
export interface ProblemFeatures {
  slots: Slot[];
  /** count of each unit family present (see UNIT_FAMILIES) */
  unitCounts: number[];
  /** normalized keyword-bag indicator vector */
  keywords: number[];
}

/** Unit families used as input features — one index each. */
export const UNIT_FAMILIES = [
  "length",
  "time",
  "velocity",
  "acceleration",
  "mass",
  "force",
  "energy",
  "momentum",
  "angle",
  "angular-vel",
  "angular-acc",
  "frequency",
  "charge",
  "field-e",
  "field-b",
  "voltage",
  "capacitance",
  "resistance",
  "current",
  "flux",
  "torque",
  "spring-k",
  "area",
  "inertia",
  "turns",
  "mu-coeff",
  "field-b-rate",
  "power",
  "inductance",
] as const;

export const N_UNIT_FEATURES = UNIT_FAMILIES.length;

/** Keyword stems that hint at topic families, in a fixed order. */
export const KEYWORDS = [
  "accelerat", "constant velocity", "rest", "displacement", "launch", "projectile",
  "friction", "normal", "tension", "incline", "pulley", "drag",
  "work", "energy", "spring", "power", "conserv",
  "collision", "momentum", "explodes", "impulse", "stick together",
  "rotat", "torque", "angular", "moment of inertia", "spool", "roll",
  "oscillat", "pendulum", "period", "shm", "amplitude", "spring constant",
  "orbit", "gravit", "satellite", "planet", "escape",
  "charge", "coulomb", "electric field", "dipole", "electron",
  "capacitor", "plate", "dielectric",
  "circuit", "resistor", "battery", "current", "volt", "emf",
  "magnet", "wire", "loop", "solenoid", "rail", "proton",
  "earth", "distance between", "apart",
  "induc", "faraday", "lenz", "flux",
] as const;

export const N_KEYWORD_FEATURES = KEYWORDS.length;

export const N_INPUT_FEATURES = N_UNIT_FEATURES + N_KEYWORD_FEATURES;

/** Map a unit string to its family index, or -1 if unknown. */
export function unitFamilyIndex(unit: string): number {
  return UNIT_FAMILIES.indexOf(unit as (typeof UNIT_FAMILIES)[number]);
}

/** Build the full input vector from slots + keyword hits. */
export function buildFeatureVector(slots: Slot[], keywordHits: number[]): number[] {
  const vec = new Array<number>(N_INPUT_FEATURES).fill(0);
  for (const s of slots) {
    const idx = unitFamilyIndex(s.unit);
    if (idx >= 0) vec[idx] += 1;
  }
  for (const k of keywordHits) {
    vec[N_UNIT_FEATURES + k] = 1;
  }
  return vec;
}
