/**
 * Tokenizer: scans problem text for quantities with units ("5 kg", "30°",
 * "2.4 m/s²", "2× Earth's radius") and physics keywords. Produces slots
 * (normalized to SI) + keyword hits that the encoder turns into features.
 */
import { KEYWORDS } from "./features";
import type { Slot } from "./features";
import { M_EARTH, R_EARTH } from "./earth";
import { G_ACC } from "./constants";

const SUPERS: Record<string, number> = {
  "⁰": 0, "¹": 1, "²": 2, "³": 3, "⁴": 4,
  "⁵": 5, "⁶": 6, "⁷": 7, "⁸": 8, "⁹": 9,
};
const SUPERS_NEG = "⁻";

function parseSuperscript(s: string): number {
  let sign = 1;
  let str = s;
  if (str.startsWith(SUPERS_NEG) || str.startsWith("-")) {
    sign = -1;
    str = str.slice(1);
  }
  let val = 0;
  for (const ch of str) {
    const d = SUPERS[ch] ?? (ch >= "0" && ch <= "9" ? Number(ch) : undefined);
    if (d === undefined) return NaN;
    val = val * 10 + d;
  }
  return sign * val;
}

function normalizeUnit(u: string): string {
  return u
    .trim()
    .replace(/\u00b2/g, "2") // ²
    .replace(/\u00b3/g, "3") // ³
    .replace(/\u00b7/g, "") // ·
    .replace(/\u00b5|\u03bc/g, "u") // μ/µ → u
    .replace(/\u00b0/g, "deg"); // °
}

/**
 * The unit family of a written unit string — "m/s²" → "velocity", "μC" →
 * "charge". Used to map a finished answer back to the quantity it is, which is
 * how the equation-sheet citation finds the right entry.
 */
export function familyForUnit(unit: string): string | undefined {
  const u = normalizeUnit(unit);
  return UNIT_MAP[u] ?? UNIT_MAP[u.toLowerCase()];
}

/**
 * Is this token a written unit rather than a variable? The symbolic answer
 * matcher needs to tell "10.7 N" (a value and its unit) from "m v²/r" (a
 * product of variables), or a unit would read as a free symbol.
 */
export function isUnitName(token: string): boolean {
  const u = normalizeUnit(token);
  return (UNIT_MAP[u] ?? UNIT_MAP[u.toLowerCase()]) !== undefined;
}

/** Normalized-unit → family. Keys are POST-normalization (no ·, μ→u, ²→2). */
const UNIT_MAP: Record<string, string> = {
  // length / time / motion
  "m": "length", "km": "length", "cm": "length", "mm": "length", "mi": "length",
  "s": "time", "ms": "time", "min": "time", "h": "time", "d": "time", "yr": "time",
  "m/s": "velocity", "km/h": "velocity", "cm/s": "velocity", "mph": "velocity",
  "m/s2": "acceleration", "m/s²": "acceleration",
  // mass
  "kg": "mass", "g": "mass", "mg": "mass",
  // force / torque / springs
  "N": "force", "kN": "force", "mN": "force",
  "Nm": "torque",
  "N/m": "spring-k",
  // power / inductance
  "W": "power", "kW": "power", "mW": "power", "MW": "power",
  "H": "inductance", "mH": "inductance", "uH": "inductance",
  // energy / momentum
  "J": "energy", "kJ": "energy", "mJ": "energy", "eV": "energy",
  "kgm/s": "momentum", "Ns": "momentum",
  // angle / rotation
  "deg": "angle", "rad": "angle",
  "rad/s": "angular-vel", "rpm": "angular-vel", "rev/s": "angular-vel", "rev/min": "angular-vel",
  "rad/s2": "angular-acc", "rad/s²": "angular-acc", "rev/s2": "angular-acc", "rev/s²": "angular-acc", "deg/s2": "angular-acc", "deg/s²": "angular-acc",
  "Hz": "frequency", "kHz": "frequency",
  // electromagnetism
  "C": "charge", "uC": "charge", "nC": "charge", "pC": "charge", "mC": "charge",
  "N/C": "field-e", "V/m": "field-e",
  "T": "field-b", "mT": "field-b", "uT": "field-b", "gauss": "field-b",
  "T/s": "field-b-rate",
  "V": "voltage", "kV": "voltage", "mV": "voltage", "MV": "voltage", "uV": "voltage",
  "F": "capacitance", "uF": "capacitance", "nF": "capacitance", "pF": "capacitance", "mF": "capacitance",
  "Ω": "resistance", "kΩ": "resistance", "MΩ": "resistance", "mΩ": "resistance", "ohm": "resistance",
  "A": "current", "mA": "current", "uA": "current", "kA": "current",
  "Wb": "flux", "Tm2": "flux",
  // misc structured
  "m2": "area", "kgm2": "inertia", "turns": "turns",
  // answer units a solver may return, so a finished answer can be mapped back
  // to its family for the equation citation ("μs" → mu-coeff, "suns" → mass)
  "us": "mu-coeff", "rev/day": "frequency", "suns": "mass",
};

/** Normalized-unit → multiplier to SI. Applied to the parsed value. */
const CONVERT: Record<string, number> = {
  // length
  "m": 1, "km": 1e3, "cm": 1e-2, "mm": 1e-3,
  // time
  "s": 1, "ms": 1e-3, "min": 60, "h": 3600, "d": 86400, "yr": 3.156e7,
  // velocity
  "m/s": 1, "km/h": 1 / 3.6, "cm/s": 1e-2, "mph": 0.44704,
  // length
  "mi": 1609.34,
  "m/s2": 1,
  // mass
  "kg": 1, "g": 1e-3, "mg": 1e-6,
  // force
  "N": 1, "kN": 1e3, "mN": 1e-3,
  "Nm": 1, "N/m": 1,
  // power / inductance
  "W": 1, "kW": 1e3, "mW": 1e-3, "MW": 1e6,
  "H": 1, "mH": 1e-3, "uH": 1e-6,
  // energy
  "J": 1, "kJ": 1e3, "mJ": 1e-3, "eV": 1.602e-19,
  "kgm/s": 1, "Ns": 1,
  // angle (to radians)
  "deg": Math.PI / 180, "rad": 1,
  "rad/s": 1, "rpm": (2 * Math.PI) / 60, "rev/s": 2 * Math.PI, "rev/min": (2 * Math.PI) / 60,
  "rad/s2": 1, "rad/s²": 1, "rev/s2": 2 * Math.PI, "rev/s²": 2 * Math.PI, "deg/s2": Math.PI / 180, "deg/s²": Math.PI / 180,
  "Hz": 1, "kHz": 1e3,
  // charge
  "C": 1, "uC": 1e-6, "nC": 1e-9, "pC": 1e-12, "mC": 1e-3,
  "N/C": 1, "V/m": 1,
  "T": 1, "mT": 1e-3, "uT": 1e-6, "gauss": 1e-4,
  "T/s": 1,
  "V": 1, "kV": 1e3, "mV": 1e-3, "MV": 1e6, "uV": 1e-6,
  "F": 1, "uF": 1e-6, "nF": 1e-9, "pF": 1e-12, "mF": 1e-3,
  "Ω": 1, "kΩ": 1e3, "MΩ": 1e6, "mΩ": 1e-3, "ohm": 1,
  "A": 1, "mA": 1e-3, "uA": 1e-6, "kA": 1e3,
  "Wb": 1, "Tm2": 1,
  "m2": 1, "kgm2": 1, "turns": 1,
};

/**
 * Quantity regex. CRITICAL: alternation is ordered longest-first so compound
 * units ("kg m/s", "N·m", "m/s2") win over their prefixes ("kg", "N", "m/s").
 * Units are listed pre-normalization here (μ, ·, ² allowed).
 */
const UNITS = [
  // compound mechanics
  "kg m/s", "kg·m/s", "kgm/s",
  "kg·m²", "kg·m2", "kg m2", "kgm2",
  "N·m", "N m", "N·s", "N s", "N/m", "N/C",
  "T/s", "T·m²", "T·m2", "T m2", "Tm2", "T m^2",
  "km/h", "cm/s", "m/s²", "m/s2", "m/s^2", "m/s",
  "rad/s²", "rad/s2", "rad/s", "deg/s²", "deg/s2", "rev/s²", "rev/s2",
  "rev/s2", "rev/s", "rev/min", "rpm",
  "m²", "m2", "m^2", "km", "cm", "mm", "min", "ms", "mph", "mi", "yr",
  "kJ/mol", "kJ", "mJ", "eV",
  // prefixed EM units
  "µC", "μC", "uC", "nC", "pC", "mC",
  "μF", "uF", "nF", "pF", "mF",
  "μT", "uT", "mT",
  "kN", "mN",
  "kV", "MV", "mV", "μV", "uV",
  "mA", "μA", "uA", "kA",
  "kΩ", "MΩ", "mΩ", "Ω",
  "kW", "mW", "MW",
  "mH", "μH", "uH",
  "kHz", "Hz",
  // angles
  "°", "rad", "deg",
  // remaining singles — "A" carries a lookbehind so the article in
  // "A 20 μF capacitor" isn't read as 20 amperes. Worded-only units
  // ("ohm", "degrees", "radians", "watt", "henry", …) deliberately live in
  // WORDED, not here — the unit-letter guard below lets wordedSlots own them.
  "Wb", "kg", "mg", "g", "s", "C", "V", "(?<![aA]\\s)A", "F", "T", "N", "J", "W", "H", "m", "h",
].join("|");

// (?![a-zA-Z]) is CRITICAL: without it "3 milliamp" parses as "3 m" (length),
// "0.5 henry" as "0.5 h" (time) — a unit symbol must not match inside a word.
// The number also accepts ASCII scientific notation ("2.0e6 m/s"), which is how
// typed and OCR'd text usually writes it; the e must be followed by digits so
// "2 eV" is still 2 electron-volts.
const QUANTITY_RE = new RegExp(
  "(-?\\d[\\d,]*(?:\\.\\d+)?(?:\\s*[×x]\\s*10\\s*\\^?\\s*(?:-?\\d+|[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)|\\s*[eE]\\s*[+-]?\\d+)?)" +
    "\\s*(" + UNITS + ")(?![a-zA-Z])",
  "g",
);

function toNumber(numStr: string): number {
  const s = numStr.replace(/,/g, "");
  const m = s.match(/^(.*?)\s*[×x]\s*10\s*\^?\s*(.+)$/);
  if (m) {
    const mant = parseFloat(m[1]);
    const exp = parseSuperscript(m[2].trim());
    if (!Number.isFinite(mant) || !Number.isFinite(exp)) return NaN;
    return mant * 10 ** exp;
  }
  return parseFloat(s); // parseFloat reads "2.0e6" as 2,000,000
}

/** Worded unit phrases → normalized unit, tried around each bare number. */
const WORDED: Record<string, string> = {
  // time
  "seconds": "s", "second": "s", "sec": "s", "secs": "s",
  "minutes": "min", "minute": "min", "hours": "h", "hour": "h", "hrs": "h", "hr": "h",
  "milliseconds": "ms", "millisecond": "ms",
  // length
  "years": "yr", "year": "yr", "yrs": "yr", "days": "d", "day": "d",
  "miles": "mi", "mile": "mi",
  "meters": "m", "meter": "m", "metres": "m", "metre": "m",
  "kilometers": "km", "kilometer": "km", "kilometres": "km", "kilometre": "km",
  "centimeters": "cm", "centimeter": "cm", "centimetres": "cm", "centimetre": "cm",
  "millimeters": "mm", "millimeter": "mm", "millimetres": "mm", "millimetre": "mm",
  // mass
  "grams": "g", "gram": "g", "kilograms": "kg", "kilogram": "kg",
  "milligrams": "mg", "milligram": "mg",
  // mechanics
  "newtons": "N", "newton": "N",
  "joules": "J", "joule": "J", "kilojoules": "kJ", "kilojoule": "kJ",
  "watts": "W", "watt": "W", "kilowatts": "kW", "kilowatt": "kW",
  "milliwatts": "mW", "milliwatt": "mW",
  // electromagnetism
  "volts": "V", "volt": "V", "kilovolts": "kV", "kilovolt": "kV",
  "millivolts": "mV", "millivolt": "mV",
  "amperes": "A", "ampere": "A", "amps": "A", "amp": "A", "milliamps": "mA", "milliamp": "mA",
  "ohms": "Ω", "ohm": "Ω", "kilo-ohms": "kΩ", "kilo-ohm": "kΩ", "kilohms": "kΩ", "kilohm": "kΩ",
  "coulombs": "C", "coulomb": "C", "microcoulombs": "uC", "microcoulomb": "uC",
  "nanocoulombs": "nC", "nanocoulomb": "nC", "millicoulombs": "mC", "millicoulomb": "mC",
  "farads": "F", "farad": "F", "microfarads": "uF", "microfarad": "uF",
  "nanofarads": "nF", "nanofarad": "nF", "picofarads": "pF", "picofarad": "pF",
  "millifarads": "mF", "millifarad": "mF",
  "teslas": "T", "tesla": "T", "milliteslas": "mT", "millitesla": "mT",
  "henries": "H", "henrys": "H", "henry": "H",
  "millihenries": "mH", "millihenrys": "mH", "millihenry": "mH",
  "microhenries": "uH", "microhenrys": "uH", "microhenry": "uH",
  "hertz": "Hz",
  // angle
  "degrees": "deg", "degree": "deg", "radians": "rad", "radian": "rad",
};

/**
 * Bare numbers followed by a worded unit ("2 seconds", "50 volts"). The
 * symbol regex can't touch these — its unit-letter guard stops "m" from
 * matching inside "meters" — so no prefix-skipping is needed here.
 */
function wordedSlots(text: string): Slot[] {
  const slots: Slot[] = [];
  for (const m of text.matchAll(/(-?\d+(?:\.\d+)?)\s*(kilograms?|grams?|milligrams?|newtons?|joules?|kilojoules?|watts?|kilowatts?|milliwatts?|volts?|kilovolts?|millivolts?|amperes?|amps?|amp|milliamps?|ohms?|kilo-ohms?|kilohms?|coulombs?|microcoulombs?|nanocoulombs?|millicoulombs?|farads?|microfarads?|nanofarads?|picofarads?|millifarads?|teslas?|milliteslas?|henrys?|henries|millihenrys?|millihenries|microhenrys?|microhenries|hertz|seconds?|secs?|minutes?|hours?|hrs?|meters?|metres?|kilometers?|kilometres?|centimeters?|centimetres?|millimeters?|millimetres?|milliseconds?|years?|yrs?|days?|miles?|degrees?|radians?)(?!\s*(?:\/|per\s+\w))/gi)) {
    const lower = m[2].toLowerCase();
    const unit = WORDED[lower] ?? WORDED[`${lower}s`];
    if (!unit) continue;
    pushUnit(slots, m[1], unit);
  }
  return slots;
}

/**
 * Worded compound units ("5 meters per second squared", "3 kilograms meters
 * per second", "40 newtons per kilogram"). Pre-extracted and STRIPPED from
 * the text so the symbol regex can't also match the "5 m" inside "meters".
 */
const WORDED_COMPOUND: Array<[RegExp, string]> = [
  [/(\d+(?:\.\d+)?)\s*(?:kilograms?|kg)\s*(?:meters?|metres?|m)\s*(?:per|\/)\s*second/gi, "kgm/s"],
  [/(\d+(?:\.\d+)?)\s*(?:meters?|metres?|m)\s*(?:per|\/)\s*second\s*(?:squared|\^2|2)/gi, "m/s2"],
  [/(\d+(?:\.\d+)?)\s*(?:meters?|metres?|m)\s*(?:per|\/)\s*second/gi, "m/s"],
  [/(\d+(?:\.\d+)?)\s*(?:kilometers?|kilometres?|km)\s*(?:per|\/)\s*(?:hours?|hrs?|h)(?![a-z])/gi, "km/h"],
  [/(\d+(?:\.\d+)?)\s*(?:miles?|mi)\s*(?:per|\/)\s*(?:hours?|hrs?|h)(?![a-z])/gi, "mph"],
  [/(\d+(?:\.\d+)?)\s*(?:revolutions?|revs?|rev)\s*(?:per|\/)\s*(?:minutes?|min)/gi, "rpm"],
  [/(\d+(?:\.\d+)?)\s*(?:teslas?|T)\s*(?:per|\/)\s*(?:seconds?|s)(?![a-z])/gi, "T/s"],
  // N/m must precede the bare N·m torque pattern
  [/(\d+(?:\.\d+)?)\s*(?:newtons?|N)\s*(?:per|\/)\s*(?:meters?|metres?|m)(?![a-z])/gi, "N/m"],
  [/(\d+(?:\.\d+)?)\s*(?:newtons?|N)\s*(?:meters?|metres?|m)/gi, "Nm"],
  [/(\d+(?:\.\d+)?)\s*(?:newtons?|N)\s*(?:per|\/)\s*(?:kilogram|kg)/gi, "m/s2"],
  [/(\d+(?:\.\d+)?)\s*(?:joules?|J)\s*(?:per|\/)\s*(?:seconds?|s)(?![a-z])/gi, "W"],
  [/(\d+(?:\.\d+)?)\s*(?:radians?|rad|degrees?|deg)\s*(?:per|\/)\s*second\s*(?:squared|\^2|2)/gi, "rad/s2"],
  [/(\d+(?:\.\d+)?)\s*(?:radians?|rad|degrees?|deg)\s*(?:per|\/)\s*second/gi, "rad/s"],
];

function extractWordedCompounds(working: string, into: Slot[]): string {
  let out = working;
  for (const [re, unit] of WORDED_COMPOUND) {
    out = out.replace(re, (_match, num: string) => {
      pushUnit(into, num, unit);
      return " ";
    });
  }
  return out;
}

export interface TokenizeResult {
  slots: Slot[];
  keywordHits: number[];
}

export function tokenize(text: string): TokenizeResult {
  let working = text.replace(/\u2212/g, "-"); // Unicode minus → ASCII
  const pre: Slot[] = [];

  // "2× Earth's mass" / "2 Earth radii" → SI-valued mass/length slots
  const earth = /([\d.]+)\s*(?:×\s*)?Earth(?:'?s)?\s+(mass|radii|radius)/gi;
  for (const m of working.matchAll(earth)) {
    const n = parseFloat(m[1]);
    if (m[2].toLowerCase() === "mass") {
      pre.push({ value: n * M_EARTH, unit: "mass", text: m[0] });
    } else {
      pre.push({ value: n * R_EARTH, unit: "length", text: m[0] });
    }
  }
  if (pre.length) {
    working = working.replace(/[\d.]+\s*(?:×\s*)?Earth(?:'?s)?\s+(mass|radii|radius)/gi, " ");
  }

  // "k = 300 N/m" → spring-k
  working = working.replace(/k\s*=\s*([\d.]+)\s*N\/m/g, (_s, num: string) => {
    pre.push({ value: parseFloat(num), unit: "spring-k", text: `k = ${num} N/m` });
    return " ";
  });

  // "coefficient of (kinetic|static) friction μ = 0.2" or bare "μ = 0.2"
  // or bare "coefficient of friction of 0.4" → mu-coeff
  working = working.replace(
    /(?:coefficient of (?:kinetic |static )?friction[^\d]*|μ[sk]?\s*=\s*)([\d.]+)/gi,
    (_s, num: string) => {
      pre.push({ value: parseFloat(num), unit: "mu-coeff", text: `μ = ${num}` });
      return " ";
    },
  );

  // "I = 3 kg·m²" → inertia
  working = working.replace(/I\s*=\s*([\d.]+)\s*kg[·\s]?m[²2]/gi, (_s, num: string) => {
    pre.push({ value: parseFloat(num), unit: "inertia", text: `I = ${num} kg·m²` });
    return " ";
  });

  // "100-turn coil" → turns
  working = working.replace(/([\d.]+)[- ]?turn/gi, (_s, num: string) => {
    pre.push({ value: parseFloat(num), unit: "turns", text: `${num} turns` });
    return " ";
  });

  // g-multiples as accelerations: "acceleration of 5.00 g", "rating of
  // 0.85 g", "experiences 4.0 g's" — trigger words keep "a 5.0 g coin"
  // reading as 5 grams of mass
  working = working.replace(
    /(?:acceleration (?:of|at)|rating of|experiences?|force of|weighs?)\s*([\d.]+)\s*g(?:'s|s)?(?![a-z])/gi,
    (_s, num: string) => {
      pre.push({ value: parseFloat(num) * G_ACC, unit: "acceleration", text: `${num} g` });
      return " ";
    },
  );
  working = working.replace(/([\d.]+)\s*g['\u2019]s(?![a-z])/gi, (_s, num: string) => {
    pre.push({ value: parseFloat(num) * G_ACC, unit: "acceleration", text: `${num} g's` });
    return " ";
  });

  // "Two 6 Ω resistors" / "Two 6 ohm resistors" → two identical slots
  working = working.replace(
    /\btwo\s+([\d.]+)\s*(kilohms?|ohms?|kilograms?|grams?|meters?|metres?|newtons?|joules?|watts?|volts?|amps?|amperes?|farads?|coulombs?|seconds?|henrys?|teslas?|Ω|kΩ|μF|uF|nF|kg|N|m)(?![a-zA-Z])/gi,
    (_s, num: string, unit: string) => {
      const sym = WORDED[unit.toLowerCase()] ?? unit;
      for (let i = 0; i < 2; i++) pushUnit(pre, num, sym);
      return " ";
    },
  );

  // "5 meters per second squared" etc. — strip before the symbol pass so
  // "meters" isn't also read as "5 m"
  working = extractWordedCompounds(working, pre);

  // wordedSlots sees the same stripped text as quantitySlots — otherwise
  // pre-extracted spans ("two 6 ohm …") would be counted twice
  const slots: Slot[] = [...pre, ...quantitySlots(working), ...wordedSlots(working)];
  const keywordHits: number[] = [];
  const lower = text.toLowerCase();
  for (let i = 0; i < KEYWORDS.length; i++) {
    if (lower.includes(KEYWORDS[i])) keywordHits.push(i);
  }
  return { slots, keywordHits };
}

/** Parse a raw number+unit string into an SI slot (shared by pre-extractors). */
function pushUnit(into: Slot[], numStr: string, rawUnit: string): void {
  const value = parseFloat(numStr);
  if (!Number.isFinite(value)) return;
  const unit = normalizeUnit(rawUnit);
  const fam = UNIT_MAP[unit] ?? UNIT_MAP[unit.toLowerCase()];
  if (!fam) return;
  into.push({
    value: value * (CONVERT[unit] ?? CONVERT[unit.toLowerCase()] ?? 1),
    unit: fam,
    text: `${numStr} ${rawUnit}`,
  });
}

function quantitySlots(text: string): Slot[] {
  const slots: Slot[] = [];
  for (const m of text.matchAll(QUANTITY_RE)) {
    let value = toNumber(m[1]);
    if (!Number.isFinite(value)) continue;
    const unit = normalizeUnit(m[2]);
    const fam = UNIT_MAP[unit] ?? UNIT_MAP[unit.toLowerCase()];
    if (!fam) continue;
    value *= CONVERT[unit] ?? CONVERT[unit.toLowerCase()] ?? 1;
    slots.push({ value, unit: fam, text: m[0].trim() });
  }
  return slots;
}

// ── named variables ("in terms of m and v") ───────────────────────────

/**
 * A quantity the problem names symbolically rather than numerically.
 *
 * This is deliberately a SEPARATE export from `tokenize()`: the network's
 * feature vector must stay byte-identical, and a bare letter next to a cue
 * word ("of mass m") is far too loose a pattern to let anywhere near the
 * numeric slot extraction.
 */
export interface VarBinding {
  /** the symbol as the problem writes it, subscript digits normalized: "v₀" → "v0" */
  symbol: string;
  /** what kind of quantity it is, when the text made that clear */
  family?: string;
  /** the value, when the problem also assigned one: "m = 2.0 kg" */
  value?: number;
  /** the span of text that declared it */
  text: string;
}

const SUBSCRIPT_DIGITS: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
};

/** One latin or greek letter, optionally carrying a subscript index. */
const SYMBOL_TOKEN = "[A-Za-z\\u0391-\\u03a9\\u03b1-\\u03c9]\\d?";

/** A cue word says what KIND of quantity the letter after it stands for. */
const CUE_FAMILY: Array<[string, string]> = [
  ["mass|weight", "mass"],
  ["length|distance|width|height|altitude|radius|diameter", "length"],
  ["speed|velocity", "velocity"],
  ["acceleration", "acceleration"],
  ["force|tension|thrust", "force"],
  ["energy|work", "energy"],
  ["power", "power"],
  ["momentum", "momentum"],
  ["torque", "torque"],
  ["charge", "charge"],
  ["current", "current"],
  ["voltage|emf|potential difference", "voltage"],
  ["resistance|resistor", "resistance"],
  ["capacitance|capacitor", "capacitance"],
  ["inductance|inductor", "inductance"],
  ["period|duration|flight time|elapsed time", "time"],
  ["time|interval", "time"],
  ["angle|inclination|incline", "angle"],
  ["frequency", "frequency"],
  ["stiffness|spring constant", "spring-k"],
  ["electric field|field strength", "field-e"],
  ["magnetic field|flux density", "field-b"],
  ["magnetic flux|flux", "flux"],
];

/** Normalize a written symbol: strip a subscript to its ASCII digit. */
function normSymbol(sym: string): string {
  let out = "";
  for (const ch of sym) {
    const sub = SUBSCRIPT_DIGITS[ch];
    if (sub !== undefined) out += sub;
    else if (ch === "\u03bc" || ch === "\u00b5") out += "u"; // μ/µ
    else out += ch;
  }
  return out;
}

/**
 * Tier A — an explicit assignment. "m = 2.0 kg" names both the symbol and its
 * value, which is the one form that cannot be mistaken for a unit.
 */
function assignedVars(text: string): VarBinding[] {
  const out: VarBinding[] = [];
  const re = new RegExp(
    `(?:^|[\\s(])(${SYMBOL_TOKEN})\\s*=\\s*(-?[\\d.,]+(?:\\s*[×x]\\s*10\\s*\\^?\\s*(?:-?\\d+|[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+))?)\\s*(${UNITS})(?![a-zA-Z])`,
    "g",
  );
  for (const m of text.matchAll(re)) {
    const value = toNumber(m[2]);
    if (!Number.isFinite(value)) continue;
    const unit = normalizeUnit(m[3]);
    const fam = UNIT_MAP[unit] ?? UNIT_MAP[unit.toLowerCase()];
    if (!fam) continue;
    out.push({
      symbol: normSymbol(m[1]),
      family: fam,
      value: value * (CONVERT[unit] ?? CONVERT[unit.toLowerCase()] ?? 1),
      text: m[0].trim(),
    });
  }
  return out;
}

/**
 * Tier B — a cue word immediately before a lone letter: "of mass m",
 * "spring constant k", "the radius r". The letter must be a free-standing
 * token, so "3.0 m" (no cue) and "in units of m/s" never produce a symbol.
 */
function cuedVars(text: string): VarBinding[] {
  const out: VarBinding[] = [];
  for (const [source, family] of CUE_FAMILY) {
    const re = new RegExp(
      `\\b(?:${source})\\b(?:\\s+(?:of|for|the|a|an|its|his|her|their|is|equals|at)){0,2}\\s+(${SYMBOL_TOKEN})(?![\\w\\u2080-\\u2089])`,
      "gi",
    );
    for (const m of text.matchAll(re)) {
      out.push({ symbol: normSymbol(m[1]), family, text: m[0].trim() });
    }
  }
  return out;
}

/** Words that join a symbol list without ending it: "m, v and r". */
const LIST_CONNECTORS = new Set(["and", "or"]);

/**
 * The symbols a question explicitly asks to be answered in terms of:
 * "in terms of m, v and r". These carry no family of their own — the rescue
 * matches them to an equation's variables by NAME first, which is both more
 * reliable and more faithful to what the student asked for.
 *
 * Scanning stops at the first real word, so "in terms of m and v, what is the
 * force?" yields [m, v] and not every initial letter in the rest of the line.
 */
export function enumeratedSymbols(text: string): string[] {
  const tail = text.match(
    /\b(?:in|expressed|express)\s+terms\s+of\b([\s\S]*?)(?:[.?]|$)/i,
  );
  if (!tail) return [];
  const out: string[] = [];
  for (const word of tail[1].split(/[^A-Za-zΑ-Ωα-ω\d]+/).filter(Boolean)) {
    const lower = word.toLowerCase();
    if (LIST_CONNECTORS.has(lower)) continue;
    if (!/^[A-Za-zΑ-Ωα-ω]\d?$/.test(word)) break; // prose has started
    const sym = normSymbol(word);
    if (!out.includes(sym)) out.push(sym);
  }
  return out;
}

/**
 * Every symbolic variable the problem declares, most reliable first.
 * `enumerated` comes from "in terms of …", then assignments, then cue words.
 */
export function tokenizeVars(
  text: string,
): { declared: VarBinding[]; enumerated: string[] } {
  const declared = [...assignedVars(text), ...cuedVars(text)];
  return { declared, enumerated: enumeratedSymbols(text) };
}
