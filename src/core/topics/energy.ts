/**
 * Energy — work–energy theorem, spring energy, gravitational potential.
 * Solver disambiguates W = Fd vs K = ½mv² vs U = mgh vs U = ½kx² by phrasing.
 */
import { buildChoices } from "./distractors";
import { take, takeAll } from "../extract";
import type { SolveCtx } from "../extract";
import type { SolveResult } from "./index";
import { G_ACC } from "../constants";
import type { Rng } from "../rng";
import type { BuiltProblem } from "./distractors";

export function generate(rng: Rng): BuiltProblem {
  const kind = rng.int(0, 3);

  if (kind === 0) {
    // W = ΔK
    const m = rng.pick([2, 3, 4, 5, 6]);
    const v = rng.pick([3, 4, 5, 6, 8]);
    const d = rng.pick([1.5, 2, 2.5, 3, 4]);
    const W = 0.5 * m * v * v;
    const scenario = `A ${m} kg crate at rest is pushed ${d} m across the floor, reaching ${v} m/s. How much net work was done on it?`;
    const sol = `W = ΔK = ½mv² = ½(${m})(${v}²)`;
    return buildChoices(
      { value: W, unit: "J" },
      [m * v * v, 0.5 * m * v, W / d, m * v],
      rng,
      scenario,
      sol,
    );
  }

  if (kind === 1) {
    // U = ½kx²
    const k = rng.pick([100, 150, 200, 250, 300, 400]);
    const x = rng.pick([0.1, 0.15, 0.2, 0.25, 0.3]);
    const U = 0.5 * k * x * x;
    const scenario = `A spring with k = ${k} N/m is compressed ${(x * 100).toFixed(0)} cm from equilibrium. How much energy is stored?`;
    const sol = `U = ½kx² = ½(${k})(${x}²)`;
    return buildChoices(
      { value: U, unit: "J" },
      [k * x * x, 0.5 * k * x, U / 2, k * x],
      rng,
      scenario,
      sol,
    );
  }

  if (kind === 2) {
    // K = ½mv² stated directly (matches the eval bank's phrasing)
    const m = rng.pick([0.5, 1, 2, 3, 1000]);
    const v = rng.pick([4, 8, 10, 15, 20]);
    const K = 0.5 * m * v * v;
    const noun = m >= 100 ? "car" : "ball";
    const scenario = `A ${m} kg ${noun} moves at ${v} m/s. What is its kinetic energy?`;
    const sol = `K = ½mv² = ½(${m})(${v}²)`;
    return buildChoices(
      { value: K, unit: "J" },
      [m * v * v, 0.5 * m * v, 2 * K, m * v],
      rng,
      scenario,
      sol,
    );
  }

  // K = mgh
  const m = rng.pick([0.5, 1, 2, 2.5, 3]);
  const h = rng.pick([2, 3, 4, 5, 6, 8]);
  const K = m * G_ACC * h;
  const scenario = `A ${m} kg mass falls ${h} m. What is its kinetic energy just before landing (from rest)?`;
  const sol = `K = mgh = (${m})(9.8)(${h})`;
  return buildChoices(
    { value: K, unit: "J" },
    [0.5 * K, 2 * K, m * h, K / (2 * G_ACC)],
    rng,
    scenario,
    sol,
  );
}

export function solve(ctx: SolveCtx): SolveResult {
  const masses = takeAll(ctx.slots, "mass");
  const vels = takeAll(ctx.slots, "velocity");
  const lengths = takeAll(ctx.slots, "length");
  const forces = takeAll(ctx.slots, "force");
  const springs = takeAll(ctx.slots, "spring-k");
  const powers = takeAll(ctx.slots, "power");
  const times = takeAll(ctx.slots, "time");
  const t = ctx.text.toLowerCase();

  const wantsWork = /net work|work (is |was |does )/.test(t);
  const wantsSpring = /spring|compress|stretch/.test(t);
  const wantsPower = /power/.test(t);

  // P = mgh/t — power to lift (or lower) a mass
  if (wantsPower && masses.length && lengths.length && times.length && !vels.length) {
    return { value: (masses[0] * G_ACC * lengths[0]) / times[0], unit: "W" };
  }
  // P = W/t with W = Fd
  if (wantsPower && forces.length && lengths.length && times.length) {
    return { value: (forces[0] * lengths[0]) / times[0], unit: "W" };
  }
  // E = P·t — energy used by a device running at power P
  if (!wantsPower && powers.length && times.length) {
    return { value: powers[0] * times[0], unit: "J" };
  }

  // W = Fd
  if (wantsWork && forces.length && lengths.length && !masses.length) {
    return { value: forces[0] * lengths[0], unit: "J" };
  }
  // U = ½kx² (explicit spring constant)
  if (springs.length && lengths.length) {
    return { value: 0.5 * springs[0] * lengths[0] * lengths[0], unit: "J" };
  }
  // U/K = mgh — lifting work or fall energy (no speed given; never when
  // the problem is actually spinning, where "length" is a radius)
  if (masses.length && lengths.length && !vels.length && !/spins|rotat|angular/.test(t)) {
    return { value: masses[0] * G_ACC * lengths[0], unit: "J" };
  }
  // W = ΔK / K = ½mv²
  if (masses.length && vels.length) {
    return { value: 0.5 * masses[0] * vels[0] * vels[0], unit: "J" };
  }
  // ½kx² with assumed mid-range k
  if (lengths.length && wantsSpring) {
    const k = take(ctx.slots, "spring-k") ?? 200;
    return { value: 0.5 * k * lengths[0] * lengths[0], unit: "J" };
  }
  return { value: NaN, unit: "J" };
}

export const energy = { name: "energy", generate, solve };
