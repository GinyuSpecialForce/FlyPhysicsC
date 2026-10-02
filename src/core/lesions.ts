/**
 * Lesions — single source of truth for every knocked-out brain region:
 * the union type, the ordered registry (display label, desk summary), and
 * the factory that builds a lesioned FlyBrain. UI selects, eval tables, and
 * the pipeline all derive from LESIONS, so a lesion added here works
 * everywhere — including the desk, which always carries its own seeded rng
 * (the old bug: central-complex needed an rng that callers forgot, so the
 * desk dropdown silently left the brain intact).
 */
import { Rng } from "./rng";
import { FlyBrain } from "./brain";
import type { FeedbackMemory } from "./feedback";
import type { Network } from "./network";

export type LesionType =
  | "none"
  | "optic-lobe" // slots scrambled/missing → wrong values
  | "mushroom-bodies" // topic classification falls back to chance
  | "central-complex" // routing picks a random circuit
  | "motor"; // circuits produce garbage

export interface Lesion {
  type: LesionType;
}

export interface LesionInfo {
  type: LesionType;
  /** human label used by the nav card, the desk select, and the eval table */
  label: string;
  /** one-line summary of what the lesion does */
  summary: string;
  /** card tone in the lesion lab */
  cardTone: "good" | "warn" | "bad";
}

/** Ordered registry: index 0 is the intact brain, the rest are lesions. */
export const LESIONS: readonly LesionInfo[] = [
  { type: "none", label: "Intact brain", summary: "All regions healthy", cardTone: "good" },
  { type: "optic-lobe", label: "Optic lobe removed", summary: "Units scrambled before encoding", cardTone: "warn" },
  { type: "mushroom-bodies", label: "Mushroom bodies removed", summary: "Topic classification falls to chance", cardTone: "bad" },
  { type: "central-complex", label: "Central complex scrambled", summary: "Routing picks a random circuit", cardTone: "bad" },
  { type: "motor", label: "Motor circuits removed", summary: "Legs produce garbage instead of math", cardTone: "bad" },
] as const;

export function lesionInfo(type: LesionType): LesionInfo {
  const info = LESIONS.find((l) => l.type === type);
  if (!info) throw new Error(`unknown lesion type: ${type}`);
  return info;
}

export function lesionLabel(type: LesionType): string {
  return lesionInfo(type).label;
}

export function lesionTypes(): LesionType[] {
  return LESIONS.map((l) => l.type);
}

/**
 * Build a brain for the given lesion. The desk (and every other caller)
 * gets a deterministic rng for free, so central-complex routing is always
 * actually scrambled — reproducibly, run to run.
 */
export function makeBrain(
  network: Network,
  lesion: Lesion = { type: "none" },
  feedback?: FeedbackMemory,
): FlyBrain {
  const lesionRng = lesion.type === "central-complex" ? new Rng(7) : null;
  return new FlyBrain(network, lesion, lesionRng, feedback);
}
