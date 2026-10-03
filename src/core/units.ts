/**
 * Unit families and their dimensions.
 *
 * A unit family is what the tokenizer produces ("velocity", "field-b"); this
 * module gives every family an SI dimension vector so the dimensional solver
 * can tell whether an equation's answer has any business being a volt.
 *
 * Dimensions are [M, L, T, I] (mass, length, time, ampere). Angle is
 * dimensionless, as radians are, so ω and f share a dimension — which is
 * exactly why a_c = ω²r and a_c = v²/r come out identical.
 */
import { UNIT_FAMILIES } from "./features";

export type UnitFamily = (typeof UNIT_FAMILIES)[number];

/** [M, L, T, I] exponents of one unit family. */
export type Dim = readonly number[];

export const FAMILY_DIMENSION: Record<UnitFamily, Dim> = {
  mass: [1, 0, 0, 0],
  length: [0, 1, 0, 0],
  time: [0, 0, 1, 0],
  velocity: [0, 1, -1, 0],
  acceleration: [0, 1, -2, 0],
  force: [1, 1, -2, 0],
  energy: [1, 2, -2, 0],
  power: [1, 2, -3, 0],
  momentum: [1, 1, -1, 0],
  torque: [1, 2, -2, 0],
  "spring-k": [1, 0, -2, 0],
  inertia: [1, 2, 0, 0],
  area: [0, 2, 0, 0],
  angle: [0, 0, 0, 0],
  "angular-vel": [0, 0, -1, 0],
  "angular-acc": [0, 0, -2, 0],
  frequency: [0, 0, -1, 0],
  turns: [0, 0, 0, 0],
  "mu-coeff": [0, 0, 0, 0],
  charge: [0, 0, 1, 1],
  current: [0, 0, 0, 1],
  voltage: [1, 2, -3, -1],
  resistance: [1, 2, -3, -2],
  capacitance: [-1, -2, 4, 2],
  inductance: [1, 2, -2, -2],
  "field-e": [1, 1, -3, -1],
  "field-b": [1, 0, -2, -1],
  flux: [1, 2, -2, -1],
  "field-b-rate": [1, 0, -2, -2],
};

/** The unit a fly prints for each family — "length" is shown as "m". */
export const FAMILY_UNIT: Record<UnitFamily, string> = {
  mass: "kg",
  length: "m",
  time: "s",
  velocity: "m/s",
  acceleration: "m/s²",
  force: "N",
  energy: "J",
  power: "W",
  momentum: "kg·m/s",
  torque: "N·m",
  "spring-k": "N/m",
  inertia: "kg·m²",
  area: "m²",
  angle: "deg",
  "angular-vel": "rad/s",
  "angular-acc": "rad/s²",
  frequency: "Hz",
  turns: "turns",
  "mu-coeff": "μs",
  charge: "C",
  current: "A",
  voltage: "V",
  resistance: "Ω",
  capacitance: "F",
  inductance: "H",
  "field-e": "N/C",
  "field-b": "T",
  flux: "Wb",
  "field-b-rate": "T/s",
};

/** SI dimensions of the named constants a form may use. */
export const CONSTANT_DIMENSION: Record<string, Dim> = {
  pi: [0, 0, 0, 0],
  G: [-1, 3, -2, 0],
  g: [0, 1, -2, 0],
  kE: [1, 3, -4, -2],
  MU0: [1, 1, -2, -2],
  EPS0: [-1, -3, 4, 2],
  E_CHARGE: [0, 0, 1, 1],
  M_earth: [1, 0, 0, 0],
  R_earth: [0, 1, 0, 0],
  M_moon: [1, 0, 0, 0],
  d_moon: [0, 1, 0, 0],
  M_sun: [1, 0, 0, 0],
  d_earth_sun: [0, 1, 0, 0],
};

/** True when two dimension vectors agree. */
export function sameDim(a: Dim | undefined, b: Dim): boolean {
  if (!a) return false;
  return a.every((v, i) => v === b[i]);
}

/** Multiply dimension vectors. */
export function mulDim(a: Dim, b: Dim): Dim {
  return a.map((v, i) => v + b[i]);
}

/** Divide dimension vectors. */
export function divDim(a: Dim, b: Dim): Dim {
  return a.map((v, i) => v - b[i]);
}

/** Dimension of a unit family, or undefined when the family is unknown. */
export function dimOf(family: string): Dim | undefined {
  return FAMILY_DIMENSION[family as UnitFamily];
}
