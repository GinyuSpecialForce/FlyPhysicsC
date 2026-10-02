/**
 * Slot extraction helpers for solver circuits: pull a quantity of a given
 * unit family out of the tokenizer's slots, with a fallback when absent.
 */
import type { Slot } from "./features";

/** First slot value with the given unit family, else undefined. */
export function take(slots: Slot[], family: string): number | undefined {
  for (const s of slots) if (s.unit === family) return s.value;
  return undefined;
}

/** All slot values with the given unit family, in order of appearance. */
export function takeAll(slots: Slot[], family: string): number[] {
  return slots.filter((s) => s.unit === family).map((s) => s.value);
}

/** First slot value, or a fallback (the circuit "assumes" a typical value). */
export function takeOr(slots: Slot[], family: string, fallback: number): number {
  return take(slots, family) ?? fallback;
}

/**
 * Angular speed ω for circular motion, from any of the equivalent givens:
 * angular velocity (rad/s or rpm), frequency (Hz), or the period T (only
 * when the phrasing is actually about rotation/orbit).
 */
export function omegaOf(slots: Slot[], text: string): number | undefined {
  const angVels = takeAll(slots, "angular-vel");
  const freqs = takeAll(slots, "frequency");
  const times = takeAll(slots, "time");
  if (angVels.length) return angVels[0];
  if (freqs.length) return 2 * Math.PI * freqs[0];
  if (
    times.length &&
    /circle|circular|orbit|rotat|spin|revolv|twirl|whirl|sling|carousel|platter|turntable|conical|swing|washer|day|levitate/.test(
      text.toLowerCase(),
    )
  ) {
    return (2 * Math.PI) / times[0];
  }
  return undefined;
}

/** Circle radius: a "diameter" length is halved, a radius is used as-is. */
export function radiusOf(slots: Slot[], text: string): number | undefined {
  const lengths = takeAll(slots, "length");
  if (!lengths.length) return undefined;
  return /diameter/i.test(text) ? lengths[0] / 2 : lengths[0];
}

/** Everything a solver circuit may need to disambiguate the problem. */
export interface SolveCtx {
  /** SI-normalized quantity slots */
  slots: Slot[];
  /** indices into KEYWORDS that matched the problem text */
  keywordHits: number[];
  /** raw problem text (for phrase-level checks like "hoop" / "parallel") */
  text: string;
}
