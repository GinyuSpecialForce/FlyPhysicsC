/**
 * Induction — Faraday: ε = N·A·ΔB/Δt, ε = B·ΔA/Δt, Φ = BA, and Lenz's-law
 * concept matching.
 */
import { buildChoices } from "./distractors";
import { takeAll } from "../extract";
import type { SolveCtx } from "../extract";
import type { Rng } from "../rng";
import type { BuiltProblem } from "./distractors";

export function generate(rng: Rng): BuiltProblem {
  const B = rng.pick([0.2, 0.5, 0.8, 1, 1.5]);
  const side = rng.pick([0.1, 0.2, 0.25, 0.3]);
  const dt = rng.pick([0.1, 0.2, 0.25, 0.5]);
  const dB = rng.pick([0.1, 0.2, 0.3, 0.5]);
  const A = side * side;
  const emf = (dB * A) / dt;
  const scenario = `A square loop of side ${side} m sits in a field that grows from ${B} T to ${round2(B + dB)} T in ${dt} s. What is the induced emf?`;
  const sol = `ε = ΔΦ/Δt = ΔB·A/Δt = (${dB})(${round2(A)})/(${dt})`;
  return buildChoices(
    { value: emf, unit: "V" },
    [emf * 2, emf / 2, (dB * A) / (dt * dt), dB * A],
    rng,
    scenario,
    sol,
  );
}

export function solve(ctx: SolveCtx): {
  value: number;
  unit: string;
  concept?: string;
} {
  const bFields = takeAll(ctx.slots, "field-b");
  const bRates = takeAll(ctx.slots, "field-b-rate");
  const lengths = takeAll(ctx.slots, "length");
  const times = takeAll(ctx.slots, "time");
  const areas = takeAll(ctx.slots, "area");
  const turns = takeAll(ctx.slots, "turns");
  const fluxes = takeAll(ctx.slots, "flux");
  const inductances = takeAll(ctx.slots, "inductance");
  const currents = takeAll(ctx.slots, "current");
  const t = ctx.text.toLowerCase();

  // Lenz's-law concept
  if (/lenz|magnet toward|opposes/.test(t)) {
    return { value: NaN, unit: "concept", concept: "opposes-the-change" };
  }
  // V = L·ΔI/Δt (inductor); two currents = a from→to change, one = ΔI stated directly
  if (inductances.length && currents.length && times.length) {
    const dI =
      currents.length >= 2 ? Math.abs(currents[1] - currents[0]) : currents[0];
    return { value: (inductances[0] * dI) / times[0], unit: "V" };
  }
  // ε = N·A·(dB/dt) — rate given directly, no separate Δt
  if (bRates.length && (areas.length || lengths.length)) {
    const N = turns[0] ?? 1;
    const A = areas[0] ?? (lengths.length ? lengths[0] * lengths[0] : 0.01);
    return { value: N * A * bRates[0], unit: "V" };
  }
  // ε = N·A·ΔB/Δt
  if (bRates.length && times.length && (areas.length || lengths.length)) {
    const N = turns[0] ?? 1;
    const A = areas[0] ?? (lengths.length ? lengths[0] * lengths[0] : 0.01);
    return { value: (N * A * bRates[0]) / times[0], unit: "V" };
  }
  // ε = B·ΔA/Δt (area change, constant B — must precede generic ΔB branch)
  if (bFields.length && areas.length >= 2 && times.length) {
    return {
      value: (bFields[0] * Math.abs(areas[1] - areas[0])) / times[0],
      unit: "V",
    };
  }
  if (bFields.length && times.length && (areas.length || lengths.length)) {
    const N = turns[0] ?? 1;
    const A = areas[0] ?? (lengths.length ? lengths[0] * lengths[0] : 0.01);
    const dB =
      bFields.length >= 2
        ? Math.abs(bFields[1] - bFields[0])
        : /drop|to zero|to 0/.test(t)
          ? bFields[0]
          : bFields[0] * 0.2;
    return { value: (N * A * dB) / times[0], unit: "V" };
  }
  // ε = ΔΦ/Δt (flux and time given directly)
  if (fluxes.length && times.length) {
    return { value: fluxes[0] / times[0], unit: "V" };
  }
  // Φ = BA
  if (bFields.length && (areas.length || lengths.length)) {
    const A = areas[0] ?? (lengths.length ? lengths[0] * lengths[0] : 0);
    return { value: bFields[0] * A, unit: "Wb" };
  }
  return { value: NaN, unit: "Wb" };
}

function round2(x: number): string {
  return (Math.round(x * 100) / 100).toString();
}

export const induction = { name: "induction", generate, solve };
