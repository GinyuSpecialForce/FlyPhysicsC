/**
 * Number formatting helpers. Physics answers are compared and displayed as
 * strings at 3 significant figures with a unit suffix — distractor generation
 * and circuit outputs both rely on this.
 */
export function fmt(x: number, sig = 3): string {
  if (!Number.isFinite(x)) return "–";
  if (x === 0) return "0";
  const abs = Math.abs(x);
  if (abs >= 1e5 || abs < 1e-2) {
    const exp = Math.floor(Math.log10(abs));
    const mant = x / 10 ** exp;
    return `${mant.toFixed(2)}×10${superscript(exp)}`;
  }
  // plain decimal — toPrecision would flip to "3.00e+3" notation above 999,
  // which no student writes and parseChoiceNumber can't read back
  const decimals = Math.max(0, sig - 1 - Math.floor(Math.log10(abs)));
  return trimZeros(x.toFixed(Math.min(decimals, 20)));
}

export function superscript(n: number): string {
  return String(n).split("").map((c) => ASCII_TO_SUPERSCRIPT[c] ?? c).join("");
}

function trimZeros(s: string): string {
  if (s.includes("e") || s.includes("E")) return s;
  if (s.includes(".")) {
    s = s.replace(/0+$/, "").replace(/\.$/, "");
  }
  return s;
}

/** Inverse of superscript(): "1.20×10⁻⁴" → 1.2e-4. NaN if not parseable. */
export function parseChoiceNumber(s: string): number {
  // exponents may be superscripted (display) or plain ASCII (typed text)
  const m = s.match(/(-?[\d.]+)(?:×10\s*\^?\s*(-?\d+|[⁻⁰¹²³⁴⁵⁶⁷⁸⁹⁺]+))?/);
  if (!m) return NaN;
  const mant = parseFloat(m[1]);
  if (!m[2]) return mant;
  const exp = parseInt(
    m[2].split("").map((c) => SUPERSCRIPT_DIGITS[c] ?? c).join(""),
    10,
  );
  return mant * 10 ** exp;
}

/** Shared digit map for superscript() and parseChoiceNumber(). */
const SUPERSCRIPT_DIGITS: Record<string, string> = {
  "⁻": "-", "⁰": "0", "¹": "1", "²": "2", "³": "3",
  "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8",
  "⁹": "9", "⁺": "+",
};

const ASCII_TO_SUPERSCRIPT: Record<string, string> = {
  "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³",
  "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸",
  "9": "⁹", "+": "⁺",
};
