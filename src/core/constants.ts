/** Physical constants (SI, intro-course precision). */
export const G = 6.67e-11; // gravitational constant, N·m²/kg²
export const K_E = 8.99e9; // Coulomb's constant, N·m²/C²
export const G_ACC = 9.8; // g near Earth's surface, m/s²
export const EPS0 = 8.85e-12; // permittivity of free space, F/m
export const MU0 = 4 * Math.PI * 1e-7; // permeability of free space, T·m/A
export const E_CHARGE = 1.6e-19; // elementary charge, C
export { M_EARTH, R_EARTH } from "./earth";

/** Solar-system bodies for the universal-gravitation unit (SI, 3-4 sig figs). */
export const MOON_MASS = 7.342e22; // kg
export const MOON_DIST = 3.844e8; // Earth–Moon center distance, m
export const SUN_MASS = 1.989e30; // kg
export const EARTH_SUN_DIST = 1.496e11; // m

export interface WorldBody {
  mass: number; // kg
  radius: number; // m
}

export const WORLDS: Record<string, WorldBody> = {
  mercury: { mass: 3.301e23, radius: 2.4397e6 },
  venus: { mass: 4.867e24, radius: 6.0518e6 },
  mars: { mass: 6.417e23, radius: 3.3895e6 },
  jupiter: { mass: 1.898e27, radius: 7.1492e7 },
  saturn: { mass: 5.683e26, radius: 6.0268e7 },
  pluto: { mass: 1.303e22, radius: 1.1883e6 },
  moon: { mass: MOON_MASS, radius: 1.7374e6 },
};
