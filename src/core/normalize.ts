/**
 * Math normalization.
 *
 * A screenshot read by OCR comes back as plain text with the usual damage:
 * "6.75 X 10-8", "m/s2", "1/2 of the circle", "O.5 kg", Greek letters dropped,
 * sentences split across lines. Every one of those breaks a downstream regex.
 * This module repairs the text before the tokenizer sees it.
 *
 * It runs on typed input too — the fixes are all no-ops on text that was typed
 * correctly, and they help when a student pastes from a notes app.
 */

/**
 * Greek letters → the words the solver branches already match. μ is left alone
 * on purpose: the tokenizer reads "μs = 0.90" as a friction coefficient, and
 * spelling it out would throw that away.
 */
const GREEK: Array<[RegExp, string]> = [
  [/ω/g, "omega"],
  [/Ω/g, "ohm"],
  [/θ/g, "theta"],
  [/Θ/g, "theta"],
  [/α/g, "alpha"],
  [/Δ/g, "delta"],
  [/τ/g, "tau"],
  [/π/g, "pi"],
];

/** Straighten the characters OCR and keyboards produce interchangeably. */
function unifyPunctuation(text: string): string {
  return text
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/ /g, " ")
    .replace(/[⇒→]/g, "->")
    .replace(/[≤⩽]/g, "<=")
    .replace(/[≥⩾]/g, ">=");
}

/**
 * Characters an OCR engine emits in place of a digit inside a number.
 * "@" for a zero is the classic one — a low-resolution 0 reads as @ often
 * enough to matter.
 */
const DIGIT_LOOKALIKE: Record<string, string> = {
  O: "0",
  o: "0",
  D: "0",
  l: "1",
  I: "1",
  "|": "1",
  "!": "1",
  S: "5",
  B: "8",
  "@": "0",
};

/**
 * Digit confusions, applied ONLY inside a numeric token so a word that
 * happens to contain an "O" is untouched. Skipped for typed text, where "5B"
 * is five of something rather than a misread eight.
 */
function fixDigits(text: string): string {
  return text.replace(/-?\d[\d.,OoIlSsBb@|!D]*(?:[eE][+-]?\d+)?/g, (token) => {
    let out = token;
    const commas = out.split(",");
    if (commas.length === 1) {
      // no separator to interpret
    } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(out)) {
      // a thousands separator — toNumber strips it later
    } else if (commas.length === 2) {
      out = `${commas[0]}.${commas[1]}`;
    } else {
      out = out.replace(/,/g, "");
    }
    return out.replace(/[OoIlSsBb@|!D]/g, (c) => DIGIT_LOOKALIKE[c] ?? c);
  });
}

/** "6.75 x 10-8", "6.75 X 10^8", "6.75 × 10⁻⁸" → the one form the tokenizer reads. */
function fixExponents(text: string): string {
  return text.replace(
    /(-?[\d.]+)\s*[x×*]\s*10\s*\^?\s*([+-]?\d+)/gi,
    (_m, mant: string, exp: string) => `${mant} × 10${exp}`,
  );
}

/** Fractions the solver branches phrase as words: "1/2 of the circle" → "half the circle". */
const SPELLED_FRACTIONS: Array<[RegExp, string]> = [
  [/\b1\s*\/\s*2\s+of\s+(?:the|a)\s+(circle|turn|lap|revolution|orbit)\b/gi, "half the $1"],
  [/\b1\s*\/\s*4\s+of\s+(?:the|a)\s+(circle|turn|lap|revolution|orbit)\b/gi, "one-quarter the $1"],
  [/\b3\s*\/\s*4\s+of\s+(?:the|a)\s+(circle|turn|lap|revolution|orbit)\b/gi, "three-quarters the $1"],
  [/\ba\s+half\s+(?:of\s+the\s+)?(circle|turn|lap|revolution|orbit)\b/gi, "half the $1"],
];

/**
 * Join lines the OCR engine broke mid-sentence: a line that starts lowercase
 * and follows a line with no terminal punctuation continues it. Choice lines
 * ("(A) 12 N") always start their own block.
 */
function rejoinLines(text: string): string {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const prev = out[out.length - 1];
    const continues =
      prev !== undefined &&
      !/[.!?;:"')\]]$/.test(prev) &&
      !/^[A-Z([]/.test(line) &&
      !/^\(?[A-Ea-e][).]/.test(line);
    if (continues && prev) {
      out[out.length - 1] = `${prev} ${line}`;
    } else {
      out.push(line);
    }
  }
  // blocks stay on separate lines: multiple-choice options are line-structured
  return out.join("\n").replace(/[ \t]{2,}/g, " ");
}

export interface NormalizeResult {
  text: string;
  /** the fixers that actually changed something, for the UI */
  applied: string[];
}

/**
 * Repair OCR/typed text into something the tokenizer can read. Returns the
 * cleaned text plus which repairs fired, so the UI can show its work.
 *
 * `ocr: true` additionally repairs the letter/digit confusions an OCR engine
 * makes ("O.5 kg" → "0.5 kg"). Leave it off for typed text.
 */
export function normalizeMath(input: string, opts: { ocr?: boolean } = {}): NormalizeResult {
  let text = input;
  const applied: string[] = [];

  // collapse hyphenation and whitespace first
  const spaced = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
  if (spaced !== text.trim()) applied.push("spacing");
  text = spaced;

  const punct = unifyPunctuation(text);
  if (punct !== text) applied.push("punctuation");
  text = punct;

  const greek = GREEK.reduce((acc, [re, word]) => acc.replace(re, word), text);
  if (greek !== text) applied.push("greek letters");
  text = greek;

  if (opts.ocr) {
    // a confusable character that STARTS a number: "O.5 kg", "l2 m", "@0 kg"
    const leading = text.replace(
      /(^|[\s(\[])([OoIlSB@|!D])(?=[\d.,])/g,
      (_m, pre: string, ch: string) => pre + (DIGIT_LOOKALIKE[ch] ?? ch),
    );
    const digits = fixDigits(leading);
    if (digits !== text) applied.push("misread digits");
    text = digits;
  }

  const exps = fixExponents(text);
  if (exps !== text) applied.push("scientific notation");
  text = exps;

  const fracs = SPELLED_FRACTIONS.reduce((acc, [re, rep]) => acc.replace(re, rep), text);
  if (fracs !== text) applied.push("fractions");
  text = fracs;

  // unit spellings OCR likes to flatten: "m/s2" → "m/s²", "kg m/s" → "kg·m/s"
  const units = text
    .replace(/(\d)\s*m\/s\s*[*^]?\s*2\b/g, "$1 m/s²")
    .replace(/\brad\/s\s*[*^]?\s*2\b/g, "rad/s²")
    .replace(/\bN\s*m2\b/g, "N·m²")
    .replace(/\bkg\s*m\/s\b/g, "kg·m/s")
    .replace(/\bN\s*m\b/g, "N·m");
  if (units !== text) applied.push("unit exponents");
  text = units;

  const joined = rejoinLines(text);
  if (joined !== text) applied.push("wrapped lines");
  text = joined;

  return { text: text.trim(), applied };
}

/** Convenience wrapper when the caller does not care what changed. */
export function normalizeMathText(input: string, opts?: { ocr?: boolean }): string {
  return normalizeMath(input, opts).text;
}
