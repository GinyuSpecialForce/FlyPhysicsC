/**
 * Physical constants, re-exported from the constants table.
 *
 * The table itself lives in `constant-table.ts` — that is the single source of
 * truth for every number the fly uses, the Reference tab, and the citations in
 * the thought timeline. This module keeps the historical named bindings so the
 * solver circuits and the tests are untouched.
 */
import { valueOf } from "./constant-table";

export const G = valueOf("G");
export const K_E = valueOf("K_E");
export const G_ACC = valueOf("g_std");
export const EPS0 = valueOf("EPS0");
export const MU0 = valueOf("MU0");
export const E_CHARGE = valueOf("E_CHARGE");
export const M_EARTH = valueOf("M_earth");
export const R_EARTH = valueOf("R_earth");

/** Solar-system bodies for the universal-gravitation unit (SI, 3-4 sig figs). */
export const MOON_MASS = valueOf("M_moon"); // kg
export const MOON_DIST = valueOf("d_moon"); // Earth–Moon center distance, m
export const SUN_MASS = valueOf("M_sun"); // kg
export const EARTH_SUN_DIST = valueOf("d_earth_sun"); // m

export { WORLDS } from "./constant-table";
export type { WorldBody } from "./constant-table";
