/**
 * Free-form input: turn any typed or photographed question into a Problem the
 * brain can run through its normal pipeline. There is no answer key — the fly
 * classifies, routes, computes, and states what it got (answer = -1).
 *
 * A photographed multiple-choice page is worth more than its bare stem: if the
 * question ends with "(A) 12 N (B) 24 N …" the fly can match its computed value
 * against real options, so `parseChoices` pulls them out.
 */
import { TOPIC_LIST } from "./features";
import type { Problem } from "./types";
import { normalizeMath } from "./normalize";

/** Sentinel passed to solve() to re-run the last freeform record (idempotent desk re-render). */
export const FREEFORM_PROBLEM = {
  id: "__freeform__",
  topic: TOPIC_LIST[0],
  text: "",
  choices: [],
  answer: -1,
  origin: "user",
} as Problem;

export type FreeformProblem = Problem & { answer: -1 };

const MAX_CHARS = 1400;

/**
 * "(A) 12 N" or "A. 12 N" → choice text, in order.
 *
 * UPPERCASE only, deliberately: exam options are lettered A–E in capitals,
 * while a homework problem's sub-parts — "(a) …", "(b) …" — are lower case and
 * must stay part of the question.
 */
const CHOICE_LINE = /^\(?([A-E])[).:]\s*(.+)$/;

export interface ParsedChoices {
  /** the question stem, with the choice lines removed */
  stem: string;
  /** the choice texts, in A–E order */
  choices: string[];
}

/**
 * Split trailing multiple-choice options off a block of text. Runs only when
 * three or more consecutive capital letters appear as short option lines —
 * anything less certain is left in the stem, because a mangled stem is worse
 * than no options at all.
 */
export function parseChoices(text: string): ParsedChoices {
  // OCR often lays several options out on one line ("(A) 3.73 (B) 9.8 …"),
  // so split there too. The pattern needs a paren AND a capital letter, which
  // is what keeps a problem's lower-case "(a)" sub-parts out of it.
  const lines = text
    .split(/\n|(?=\(\s?[A-E][).:])/g)
    .map((l) => l.trim())
    .filter(Boolean);
  const stemLines: string[] = [];
  const found: Array<{ letter: string; text: string }> = [];
  let collecting = false;
  for (const line of lines) {
    const m = CHOICE_LINE.exec(line);
    if (m) {
      collecting = true;
      found.push({ letter: m[1], text: m[2].trim() });
      continue;
    }
    if (collecting && found.length) {
      // a continuation line of the option above
      found[found.length - 1].text += ` ${line}`;
      continue;
    }
    stemLines.push(line);
  }
  const letters = found.map((f) => f.letter);
  const consecutive = letters.length >= 3 && letters.every((l, i) => l === "ABCDE"[i]);
  const short = found.every((f) => f.text.length <= 140);
  if (!consecutive || !short || !stemLines.join(" ").trim()) {
    return { stem: text.trim(), choices: [] };
  }
  return { stem: stemLines.join(" ").trim(), choices: found.map((f) => f.text) };
}

/** Parse typed/photographed text into a Problem. Throws when there's nothing to solve. */
export function buildFreeformProblem(
  input: string,
  opts: { ocr?: boolean } = {},
): FreeformProblem {
  const { text: clean } = normalizeMath(input, opts);
  if (!clean) throw new Error("Type a question first — the fly can't read a blank page.");
  const { stem, choices } = parseChoices(clean);
  const body = stem || clean;
  return {
    id: `user-${Date.now().toString(36)}`,
    topic: TOPIC_LIST[0], // unknown; the mushroom bodies figure it out
    text: body.length > MAX_CHARS ? `${body.slice(0, MAX_CHARS)}…` : body,
    choices: choices.map((text) => ({ text })),
    answer: -1,
    origin: "user",
  };
}

/** Shown under the input box; the fly's circuits handle all of these. */
export const FREEFORM_EXAMPLES: string[] = [
  "A 3 kg ball moves at 8 m/s. What is its kinetic energy?",
  "A 5 kg crate is pulled with 40 N across a frictionless surface. What is its acceleration?",
  "A 2 kg mass falls 4 m. How much energy does it gain?",
  "A 1500 kg car moves at 20 m/s. What is its momentum?",
  "A 0.5 kg block on a spring with k = 300 N/m is stretched 0.1 m. How much energy is stored?",
];
