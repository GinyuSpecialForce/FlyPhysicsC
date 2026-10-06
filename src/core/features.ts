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

/** The family name for a unit family index, for display. */
export function unitFamilyName(index: number): string {
  return UNIT_FAMILIES[index] ?? "?";
}

/**
 * Sparse form of an input vector — the wire format for the shared hive corpus.
 *
 * The 95-float vector is almost always ~6 nonzeros (a couple of unit families
 * plus a few keyword stems), so storing it densely would make the shared
 * corpus file ~20x larger than it needs to be for exactly zero information.
 * Units are [index, count, index, count, …] because a problem can mention two
 * masses; keywords are plain indices because the hit vector is already binary.
 */
export interface SparseVector {
  /** flat [familyIndex, count, familyIndex, count, …] pairs */
  units: number[];
  /** keyword-stem indices that fired */
  keywords: number[];
}

export function sparsifyVector(vec: readonly number[]): SparseVector {
  const units: number[] = [];
  // only the unit-family region — the tail is keyword stems, handled below
  for (let i = 0; i < N_UNIT_FEATURES && i < vec.length; i++) {
    const v = vec[i];
    if (Number.isFinite(v) && v !== 0) units.push(i, v);
  }
  const keywords: number[] = [];
  for (let k = 0; N_UNIT_FEATURES + k < vec.length; k++) {
    if (vec[N_UNIT_FEATURES + k] !== 0) keywords.push(k);
  }
  return { units, keywords };
}

/** Exact inverse of sparsifyVector. Out-of-range indices are ignored. */
export function vectorFromSparse(sparse: SparseVector): number[] {
  const vec = new Array<number>(N_INPUT_FEATURES).fill(0);
  const { units, keywords } = sparse;
  for (let i = 0; i + 1 < units.length; i += 2) {
    const idx = units[i];
    const count = units[i + 1];
    if (Number.isInteger(idx) && idx >= 0 && idx < N_UNIT_FEATURES && Number.isFinite(count)) {
      vec[idx] = count;
    }
  }
  for (const k of keywords) {
    if (Number.isInteger(k) && k >= 0 && k < N_KEYWORD_FEATURES) vec[N_UNIT_FEATURES + k] = 1;
  }
  return vec;
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
