/**
 * The dimensional solver.
 *
 * Two jobs:
 *
 * 1. A tiny, safe expression language for the `form` strings in
 *    `equation-sheet.ts` — `+ - * / ^ ( )`, numbers, and identifiers. It is a
 *    hand-written recursive-descent parser, not `eval`, so it is safe to run
 *    on anything and its dimension analysis walks the same AST.
 *
 * 2. The rescue search. When no hand-written circuit can bind a problem, the
 *    fly searches the equation sheet for a direction whose variables ALL bind
 *    to real slots of the right families, scored against the unit family the
 *    question actually asked for. This is what lets it answer phrasings nobody
 *    ever hand-coded — and it can be made to decline, which matters more than
 *    the coverage.
 */
import { FORM_CONSTANTS, FLAT_ENTRIES } from "./equation-sheet";
import { FORM_FUNCS, parseForm } from "./form-ast";
import type { Node } from "./form-ast";
import { canonical, materialize, renderSym, symbolicOf, symbolsOf } from "./symbolic";
import type { Sym } from "./symbolic";
import type { VarBinding } from "./tokenizer";

// the form grammar moved to ./form-ast so the symbolic printer can share it;
// re-exported here because the equation-sheet tests import it from this module
export { parseForm, FORM_FUNCS } from "./form-ast";
export type { Node } from "./form-ast";
import type { FlatEntry, SheetEntry } from "./equation-sheet";
import type { Topic } from "./features";
import { CONSTANT_DIMENSION, dimOf, divDim, FAMILY_UNIT, mulDim, sameDim } from "./units";
import type { Dim, UnitFamily } from "./units";
import type { Slot } from "./features";

/** Evaluate a parsed form against bindings (falling back to AP constants). */
export function evalNode(node: Node, bindings: Record<string, number>): number {
  switch (node.kind) {
    case "num":
      return node.value;
    case "var": {
      const v = bindings[node.name] ?? FORM_CONSTANTS[node.name];
      if (v === undefined) throw new Error(`unbound variable ${node.name}`);
      return v;
    }
    case "neg":
      return -evalNode(node.arg, bindings);
    case "bin": {
      const a = evalNode(node.left, bindings);
      const b = evalNode(node.right, bindings);
      switch (node.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return a / b;
        case "^":
          return a ** b;
        default:
          throw new Error(`bad operator ${node.op}`);
      }
    }
    case "call": {
      const fn = FORM_FUNCS[node.name];
      if (!fn) throw new Error(`unknown function ${node.name}`);
      return fn(...node.args.map((a) => evalNode(a, bindings)));
    }
  }
}

/** The dimension of a form, given the dimensions of its variables. */
export function formDimension(node: Node, vars: Record<string, string>): Dim | undefined {
  const ZERO: Dim = [0, 0, 0, 0];
  const walk = (n: Node): Dim | undefined => {
    switch (n.kind) {
      case "num":
        return ZERO;
      case "var":
        return dimOf(vars[n.name]) ?? CONSTANT_DIMENSION[n.name];
      case "neg":
        return walk(n.arg);
      case "bin": {
        if (n.op === "^") {
          const l = walk(n.left);
          const e = exponent(n.right);
          if (!l || !e) return undefined;
          return l.map((v, i) => v * e[i]);
        }
        const l = walk(n.left);
        const r = walk(n.right);
        if (!l || !r) return undefined;
        if (n.op === "*") return mulDim(l, r);
        if (n.op === "/") return divDim(l, r);
        // adding or subtracting two quantities of the SAME dimension gives that
        // dimension back — "m1·v1 + m2·v2" is still a momentum, and "A² − x²" is
        // still a squared length. Naive exponent arithmetic would double them.
        if (sameDim(l, r)) return [...l];
        return l.map((v, i) => v + r[i]);
      }
      case "call": {
        // only sqrt/cbrt change a dimension; everything else is dimensionless
        if (n.name === "sqrt" || n.name === "cbrt") {
          const a = walk(n.args[0]);
          const p = n.name === "sqrt" ? 2 : 3;
          return a ? a.map((v) => v / p) : undefined;
        }
        return ZERO;
      }
    }
  };
  // "x^2" scales by the literal 2; "x^y" would scale by y's dimension
  const exponent = (n: Node): Dim | undefined =>
    n.kind === "num" ? [n.value, n.value, n.value, n.value] : walk(n);
  return walk(node);
}

// ── the rescue search ───────────────────────────────────────────────

export interface RescueOptions {
  slots: Slot[];
  /** the problem text — a "central mass" is not the mass of the thing orbiting */
  text: string;
  /** unit families the final question asked for, if the phrasing revealed any */
  wanted?: UnitFamily[] | undefined;
  /** topics the brain ranked highest (topic index → name) */
  rankedTopics: Topic[];
  /** topic the routed circuit settled on */
  circuitTopic: Topic;
  /** symbolic variables the problem declared, for "in terms of m and v" */
  vars?: { declared: VarBinding[]; enumerated: string[] };
  /** the question asked to be answered in terms of variables */
  wantSymbolic?: boolean;
}

/** The symbolic half of a rescued answer, when one was asked for. */
export interface RescueSymbolic {
  /** printed the way a student writes it: "mv²/r" */
  expression: string;
  /** the same answer, normalized for comparing against a printed choice */
  canonical: string;
  /** the free symbols, in reading order */
  variables: string[];
  /** the value, when every symbol in the expression was also known */
  value?: number;
  /** the expression tree, so a choice can be matched structurally */
  sym: Sym;
}

export interface RescueResult {
  value: number;
  unit: string;
  /** the equation sheet entry used, for the citation */
  entry: SheetEntry;
  equationId: string;
  display: string;
  section: string;
  /** variable key → value, for the substitution line */
  bindings: Record<string, number>;
  score: number;
  /** the runners-up, so the fly can admit what else it considered */
  runnersUp: string[];
  /** present when the question asked for an answer in terms of variables */
  symbolic?: RescueSymbolic;
}

const THRESHOLD = 45;

/**
 * Phrasings that mark a mass slot as belonging to some object that is NOT the
 * central body — a satellite's own mass is not M⊕, a block's mass is not a
 * planet's.
 */
const ORBITING_OBJECT =
  /\b(?:satellites?|spacecraft|probe|asteroids?|comets?|balls?|blocks?|boxes?|books?|carts?|cars?|crates?|boulders?|pendulums?|coins?|persons?|trucks?|boats?|stones?|rocks?|boy|girl)\b/;

/** Lengths that are not heights — a hoop's radius is not a drop height. */
const RADIAL_LENGTH = /\b(?:radius|diameter|circumference|thickness|wide|width|rod|hoop)\b/;

/**
 * Text that puts the problem in an ORBITAL context, where assuming Earth's
 * mass is fair. A pendulum that happens to swing "on Earth" is not orbiting
 * anything, so "earth" alone is not enough.
 */
const CELESTIAL =
  /\borbit|satellit|planet|revolut|kepler|ellipt|\bmoon\b|\bsun\b|\bstar\b|orbit\w*/;

/**
 * Altitude geometry (r = R⊕ + h) is the gravitation circuit's job — the sheet
 * has no way to say "the given length is measured from the surface".
 */
const ALTITUDE_GEOMETRY = /\baltitudes?\b|\babove the (?:earth'?s |surface )|\bhigher than\b/;

/** Bind one variable key to a slot of the declared family, without reuse.
 *  When `key` hints at an initial (`vi`, `v0`, `w1`) or final (`vf`, `w2`)
 *  quantity, prefer a slot carrying that semantic role first.
 */
function bind(family: UnitFamily, slots: Slot[], used: Set<number>, key?: string): Slot | undefined {
  const preferredRole =
    key === "vi" || key === "v0" || key === "w1" || key === "x0"
      ? "initial"
      : key === "vf" || key === "w2"
        ? "final"
        : key === "r"
          ? "radius"
          : key === "h" || key === "y"
            ? "height"
            : undefined;
  if (preferredRole) {
    for (let i = 0; i < slots.length; i++) {
      if (used.has(i)) continue;
      if (slots[i].unit !== family) continue;
      if (!Number.isFinite(slots[i].value)) continue;
      if (slots[i].role === preferredRole) {
        used.add(i);
        return slots[i];
      }
    }
  }
  for (let i = 0; i < slots.length; i++) {
    if (used.has(i)) continue;
    if (slots[i].unit !== family) continue;
    if (!Number.isFinite(slots[i].value)) continue;
    used.add(i);
    return slots[i];
  }
  return undefined;
}

/**
 * The name to print an equation's variable under.
 *
 * The question wins: "in terms of m and v" names the variables outright, and
 * those are matched by NAME. Failing that a declared variable of the right kind
 * supplies its own letter ("of mass m"). Failing that the equation's own key is
 * used, which is the textbook symbol for that quantity anyway.
 *
 * `explicit` marks the first two: only those count as a quantity the problem
 * actually supplied, so a free-standing equation key can't make an unrelated
 * equation look like a good match.
 */
function displayFor(
  key: string,
  family: UnitFamily,
  vars: { declared: VarBinding[]; enumerated: string[] } | undefined,
  taken: Set<string>,
): { sym: string; explicit: boolean } | undefined {
  if (vars) {
    for (const s of vars.enumerated) {
      if (s.toLowerCase() === key.toLowerCase() && !taken.has(s)) {
        return { sym: s, explicit: true };
      }
    }
    for (const d of vars.declared) {
      if (d.family !== family || taken.has(d.symbol)) continue;
      return { sym: d.symbol, explicit: true };
    }
  }
  if (/^[A-Za-z][A-Za-z0-9]?$/.test(key) && !taken.has(key)) {
    return { sym: key, explicit: false };
  }
  return undefined;
}

/**
 * Find an equation direction that (a) has every input bindable, (b) aims at
 * the unit family the question wants, and (c) actually uses the quantities the
 * problem supplied. Returns undefined rather than guessing.
 */
export function rescueSolve(opts: RescueOptions): RescueResult | undefined {
  const { slots, wanted, circuitTopic, text } = opts;
  const symbolicMode = opts.wantSymbolic === true;
  if (slots.length === 0) return undefined;
  const lower = text.toLowerCase();
  if (ALTITUDE_GEOMETRY.test(lower)) return undefined;
  const centralIsElsewhere = ORBITING_OBJECT.test(lower);
  const radialLength = RADIAL_LENGTH.test(lower);
  const celestial = CELESTIAL.test(lower);

  const present = slots.map((s) => s.unit);

  const candidates: Array<{
    flat: FlatEntry;
    score: number;
    bindings: Record<string, number>;
    /** key → the name to print that variable under */
    display: Record<string, string>;
    /** keys left as symbols rather than numbers */
    symbolicKeys: Set<string>;
    usedSlots: Set<number>;
    wantedHit: boolean;
  }> = [];  for (const flat of FLAT_ENTRIES) {
    const { entry, equation } = flat;
    if (equation.requires && !equation.requires.some((w) => lower.includes(w))) continue;
    const targetFamily = entry.vars[entry.target];
    const bindings: Record<string, number> = {};
    const display: Record<string, string> = {};
    const symbolicKeys = new Set<string>();
    const taken = new Set<string>();
    const usedSlots = new Set<number>();
    let defaultsUsed = 0;
    let explicitSymbols = 0;
    let ok = true;
    for (const [key, family] of Object.entries(entry.vars)) {
      if (key === entry.target) continue;
      // a "central" mass may not come from an orbiting object's own mass, and a
      // height may not come from a radius
      const role = entry.roles?.[key];
      const barred =
        (role === "central" && centralIsElsewhere && family === "mass") ||
        (role === "height" && radialLength && family === "length");
      // a barred variable may still be named, as long as the problem names it
      const label = barred
        ? undefined
        : displayFor(key, family, opts.vars, taken);
      if (label) {
        display[key] = label.sym;
        taken.add(label.sym);
        if (label.explicit) explicitSymbols++;
      }
      const found = barred ? undefined : bind(family, slots, usedSlots, key);
      if (found) {
        bindings[key] = found.value;
        continue;
      }
      // nothing numeric: keep the variable symbolic if the problem named it,
      // and only otherwise reach for a tabulated constant
      if (label && opts.vars && (opts.vars.enumerated.length || opts.vars.declared.length)) {
        symbolicKeys.add(key);
        continue;
      }
      // fall back to a tabulated constant, but only in a context where that
      // constant is the one the problem means
      const fallback = entry.defaults?.[key];
      if (fallback && (equation.celestial ? celestial : true) && FORM_CONSTANTS[fallback] !== undefined) {
        bindings[key] = FORM_CONSTANTS[fallback];
        defaultsUsed++;
        continue;
      }
      ok = false;
      break;
    }
    if (!ok) continue;
    // with two or more quantities on the page, an equation that swallows only
    // one of them is almost certainly the wrong relation
    if (slots.length >= 2 && usedSlots.size + defaultsUsed + explicitSymbols < 2) continue;

    const wantedHit = wanted?.includes(targetFamily) ?? false;
    const familyHit = present.includes(targetFamily);
    // a result in a family nobody mentioned and nobody asked for is a guess
    if (!wantedHit && !familyHit) continue;

    // an equation that ignores quantities the problem handed over is a guess
    const usedFamilies = new Set(Array.from(usedSlots).map((i) => present[i]));
    const unused = present.filter((f) => f !== targetFamily && !usedFamilies.has(f)).length;
    let score = 0;
    if (wantedHit) score += 40;
    if (familyHit) score += 10;
    if (equation.topics.includes(circuitTopic)) score += 15;
    score += Math.round(Math.min(1, (usedSlots.size + defaultsUsed + explicitSymbols) / Math.max(1, slots.length)) * 50);
    score -= Math.min(50, unused * 25);
    score += Math.max(0, 8 - Object.keys(entry.vars).length);
    // an equation that resolves entirely to numbers can also be printed in
    // terms of its variables, so it beats one that stays half-symbolic
    if (symbolicMode && !symbolicKeys.size) score += 5;

    candidates.push({ flat, score, bindings, display, symbolicKeys, usedSlots, wantedHit });
  }

  if (!candidates.length) return undefined;
  // if the question named the kind of answer it wants and nothing matches,
  // decline rather than answer in the wrong family
  if (wanted?.length && !candidates.some((s) => s.wantedHit)) return undefined;
  const scored = candidates.filter((s) => s.score >= THRESHOLD);
  if (!scored.length) return undefined;
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  let value = NaN;
  let symbolic: RescueSymbolic | undefined;

  if (symbolicMode && Object.keys(best.display).length) {
    // The expression is written with the problem's own names, and the measured
    // values are kept alongside rather than folded in. That is what lets one
    // answer come back BOTH ways: "mv²/r" and, since every symbol happens to be
    // known, 10.7 N as well.
    const env: Record<string, Sym> = {};
    for (const [key, name] of Object.entries(best.display)) {
      env[key] = { kind: "var", name };
    }
    const sym = symbolicOf(best.flat.entry.form, env);
    if (sym === undefined) return undefined;
    const subs: Record<string, number> = {};
    for (const [key, name] of Object.entries(best.display)) {
      const numeric = best.bindings[key];
      if (numeric !== undefined) subs[name] = numeric;
    }
    for (const d of opts.vars?.declared ?? []) {
      if (d.value !== undefined && subs[d.symbol] === undefined) subs[d.symbol] = d.value;
    }
    const materialized = materialize(sym, subs);
    symbolic = {
      expression: renderSym(sym),
      canonical: canonical(sym),
      variables: symbolsOf(sym),
      value: materialized,
      sym,
    };
    value = materialized === undefined ? NaN : materialized;
  }

  if (!symbolic) {
    try {
      value = evalNode(parseForm(best.flat.entry.form), best.bindings);
    } catch {
      return undefined;
    }
  }
  if (!Number.isFinite(value) && !symbolic) return undefined;
  if (!Number.isFinite(value) && symbolic?.value === undefined) return undefined;

  return {
    value,
    unit: FAMILY_UNIT[best.flat.entry.vars[best.flat.entry.target]],
    entry: best.flat.entry,
    equationId: best.flat.equation.id,
    display: best.flat.entry.display,
    section: best.flat.equation.section,
    bindings: best.bindings,
    score: best.score,
    runnersUp: scored.slice(1, 4).map((s) => s.flat.entry.display),
    symbolic,
  };
}

/**
 * Multi-hop forward-chaining dimensional rescue (depth 2).
 *
 * When a single sheet equation cannot bridge the given `slots` to `wanted`
 * (for example, given `V`, `R`, `t` and asked for energy `W = P·t` via `P = V²/R`,
 * or given `F`, `m`, `v` and asked for power or displacement via `a = F/m`),
 * this searches pairs of equations `(step1 → intermediateSlot → step2)` where:
 *   1. `step1` binds cleanly to a subset of the given `slots` and produces a
 *      new quantity family not already present;
 *   2. `step2` consumes that derived quantity TOGETHER with all remaining
 *      unused given slots to produce a `wanted` family;
 *   3. every given slot in the problem is consumed across the two steps (no
 *      leftover unexplainable numbers).
 *
 * Kept separate from `rescueSolve()` so single-hop callers and tests keep
 * their exact single-equation semantics.
 */
export function rescueMultiHop(opts: RescueOptions): (RescueResult & { chainSteps: string[] }) | undefined {
  const { slots, wanted, circuitTopic, text } = opts;
  if (!wanted?.length || slots.length < 2) return undefined;
  const lower = text.toLowerCase();
  if (ALTITUDE_GEOMETRY.test(lower)) return undefined;
  // If the text explicitly supplies a parenthesized formula hint like "(I = MR²)",
  // let the dedicated textbook/shape solver handle or decline as appropriate.
  if (/\([iI]\s*=/.test(text)) return undefined;

  const presentFamilies = new Set(slots.map((s) => s.unit));

  for (const flat1 of FLAT_ENTRIES) {
    const { entry: e1, equation: eq1 } = flat1;
    if (eq1.requires && !eq1.requires.some((w) => lower.includes(w))) continue;
    const midFamily = e1.vars[e1.target];
    // Only synthesize an intermediate quantity we don't already have
    if (presentFamilies.has(midFamily)) continue;

    const used1 = new Set<number>();
    const bind1: Record<string, number> = {};
    let ok1 = true;
    for (const [k, fam] of Object.entries(e1.vars)) {
      if (k === e1.target) continue;
      const found = bind(fam, slots, used1, k);
      if (!found) {
        ok1 = false;
        break;
      }
      bind1[k] = found.value;
    }
    if (!ok1 || used1.size === 0 || used1.size >= slots.length) continue;

    let midVal = NaN;
    try {
      midVal = evalNode(parseForm(e1.form), bind1);
    } catch {
      continue;
    }
    if (!Number.isFinite(midVal)) continue;

    // Build the augmented slot list: unused original slots + the derived intermediate slot
    const remainingSlots: Slot[] = slots.filter((_, idx) => !used1.has(idx));
    const derivedSlot: Slot = {
      unit: midFamily,
      value: midVal,
      text: `${e1.target} (from ${e1.display})`,
    };
    const step2Slots = [...remainingSlots, derivedSlot];

    // Step 2 must use ALL remaining slots plus the derived intermediate slot,
    // and land directly on a wanted unit family.
    const step2 = rescueSolve({
      slots: step2Slots,
      text,
      wanted,
      rankedTopics: opts.rankedTopics,
      circuitTopic,
    });
    if (!step2) continue;

    // Verify step 2 actually consumed the derived intermediate family and all remaining slots
    const step2Inputs = Object.entries(step2.entry.vars).filter(([k]) => k !== step2.entry.target);
    if (step2Inputs.length < remainingSlots.length + 1) continue;
    if (!step2Inputs.some(([, fam]) => fam === midFamily)) continue;

    return {
      ...step2,
      display: `${e1.display} → ${step2.display}`,
      bindings: { ...bind1, ...step2.bindings },
      chainSteps: [
        `Step 1 (${eq1.section}): ${e1.display} → ${midVal.toPrecision(4)} ${FAMILY_UNIT[midFamily]}`,
        `Step 2 (${step2.section}): ${step2.display} → ${step2.value.toPrecision(4)} ${step2.unit}`,
      ],
    };
  }

  return undefined;
}

// ── citations ───────────────────────────────────────────────────────

export interface Citation {
  display: string;
  section: string;
  equationId: string;
}

/**
 * Name the equation sheet entry a finished answer most plausibly used: the
 * target family must match the answer's unit, and every input family must be
 * among the quantities the circuit actually bound. This is how every solver
 * gets a citation without being edited.
 */
export function citeEquation(
  slots: Slot[],
  unit: string,
  circuitTopic: Topic,
): Citation | undefined {
  const target = dimOf(unit);
  if (!target) return undefined;
  const families = new Set(slots.map((s) => s.unit));
  let best: { c: Citation; score: number } | undefined;
  for (const { equation, entry } of FLAT_ENTRIES) {
    const outFamily = entry.vars[entry.target];
    if (!sameDim(dimOf(outFamily), target)) continue;
    const inputs = Object.entries(entry.vars).filter(([k]) => k !== entry.target);
    if (!inputs.length) continue;
    if (!inputs.every(([, fam]) => families.has(fam))) continue;
    let score = equation.topics.includes(circuitTopic) ? 10 : 0;
    score += inputs.length * 2; // prefer the equation that uses the most givens
    if (!best || score > best.score) {
      best = { c: { display: entry.display, section: equation.section, equationId: equation.id }, score };
    }
  }
  return best?.c;
}

/**
 * "Which equation do I use for …?" — answer with the sheet entry itself.
 * Matches a question against each equation's aliases and its display.
 */
export function equationForConcept(question: string, circuitTopic: Topic): Citation | undefined {
  // only answer when the question is asking which formula to use
  if (!/\b(which|what) (equation|formula|relation|expression)\b|\bwhat do i use\b/.test(question.toLowerCase())) {
    return undefined;
  }
  const q = question.toLowerCase();
  let best: { c: Citation; score: number } | undefined;
  for (const equation of FLAT_ENTRIES.map((f) => f.equation).filter((v, i, a) => a.indexOf(v) === i)) {
    let score = equation.topics.includes(circuitTopic) ? 6 : 0;
    for (const alias of equation.aliases) if (q.includes(alias.toLowerCase())) score += 40 - alias.length / 10;
    for (const entry of equation.entries) {
      if (q.includes(entry.display.toLowerCase())) score += 40;
    }
    if (score <= 6) continue;
    if (!best || score > best.score) {
      best = {
        c: {
          display: equation.entries[0].display,
          section: equation.section,
          equationId: equation.id,
        },
        score,
      };
    }
  }
  return best && best.score >= 25 ? best.c : undefined;
}
