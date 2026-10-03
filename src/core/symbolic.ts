/**
 * Symbolic answers: "find the centripetal force in terms of m and v".
 *
 * The rest of the pipeline is numeric — `Slot.value` is a number and every
 * circuit returns one. This module evaluates the *same* `parseForm` AST the
 * dimensional rescue already uses, but with a value that is either a number or
 * an unevaluated expression. Because a `Sym` is lazy, "symbolic when it has to
 * be, numeric when it doesn't" falls out of the data model rather than needing
 * two separate solvers: `materialize()` folds an expression to a number exactly
 * when every leaf resolves, and gives up (`undefined`) otherwise.
 *
 * Printing normalizes commutative factors — `v*m` and `m*v` render identically —
 * because a student writes `mv²/r` in any order and a choice list may spell it
 * either way. Tabulated constants are folded in on the way out, so a tension
 * reads `mg` rather than `m·9.8`.
 */
import { FORM_CONSTANTS } from "./equation-sheet";
import { FORM_FUNCS, parseForm } from "./form-ast";
import type { Node } from "./form-ast";
import { superscript } from "./format";
import { isUnitName } from "./tokenizer";

/**
 * An expression over named symbols. This mirrors the parsed `Node` exactly —
 * same `kind` discriminant — so the two evaluators walk identical trees.
 */
export type Expr =
  | { kind: "num"; value: number }
  | { kind: "var"; name: string }
  | { kind: "neg"; arg: Expr }
  | { kind: "bin"; op: string; left: Expr; right: Expr }
  | { kind: "call"; name: string; args: Expr[] };

/** A value that is either fully numeric or still symbolic. */
export type Sym = number | Expr;

const num = (value: number): Expr => ({ kind: "num", value });
const vari = (name: string): Expr => ({ kind: "var", name });
const bin = (op: string, left: Expr, right: Expr): Expr => ({ kind: "bin", op, left, right });
const negate = (arg: Expr): Expr => ({ kind: "neg", arg });

/** Display names for the subscripted variables the sheet uses. */
const SYMBOL_DISPLAY: Record<string, string> = {
  x0: "x₀", v0: "v₀", x1: "x₁", v1: "v₁",
  y0: "y₀", p1: "p₁", p2: "p₂", p0: "p₀",
};

const isNum = (s: Sym): s is number => typeof s === "number";

/** A partially-numeric sub-result becomes a literal node inside a larger tree. */
const asExpr = (s: Sym): Expr => (typeof s === "number" ? num(s) : s);

/**
 * Evaluate a parsed form where a variable may resolve to a number OR to a
 * display symbol. A binding that is a string means "stay symbolic, and print
 * the problem's own name for this quantity".
 */
export function evalSym(node: Node, env: Record<string, Sym>): Sym {
  switch (node.kind) {
    case "num":
      return node.value;
    case "var": {
      const bound = env[node.name];
      if (bound !== undefined) return bound;
      // Tabulated constants (g, G, k_e …) deliberately stay UNRESOLVED here.
      // Folding them eagerly would print a tension as "9.8·m" instead of "mg";
      // materialize() resolves them at the end, where a fully numeric result
      // still collapses to a plain number.
      return vari(node.name);
    }
    case "neg": {
      const arg = evalSym(node.arg, env);
      return isNum(arg) ? -arg : negate(arg);
    }
    case "bin": {
      const left = evalSym(node.left, env);
      const right = evalSym(node.right, env);
      if (isNum(left) && isNum(right)) {
        switch (node.op) {
          case "+": return left + right;
          case "-": return left - right;
          case "*": return left * right;
          case "/": return left / right;
          case "^": return left ** right;
          default: throw new Error(`bad operator ${node.op}`);
        }
      }
      // fold the algebraic identities that keep the printed form readable
      if (node.op === "*") {
        if (isNum(right) && right === 0) return 0;
        if (isNum(left) && left === 0) return 0;
        if (isNum(right) && right === 1) return left;
        if (isNum(left) && left === 1) return right;
      }
      if (node.op === "/" && isNum(right) && right === 1) return left;
      if (node.op === "^" && isNum(right) && right === 1) return left;
      return bin(node.op, asExpr(left), asExpr(right));
    }
    case "call": {
      const args = node.args.map((a) => evalSym(a, env));
      if (args.every(isNum)) {
        const fn = FORM_FUNCS[node.name];
        if (!fn) throw new Error(`unknown function ${node.name}`);
        return fn(...args);
      }
      return { kind: "call", name: node.name, args: args.map(asExpr) };
    }
  }
}

/** Parse and evaluate in one step; returns undefined if the form won't parse. */
export function symbolicOf(form: string, env: Record<string, Sym>): Sym | undefined {
  try {
    return evalSym(parseForm(form), env);
  } catch {
    return undefined;
  }
}

/** Every identifier a parsed form mentions, in reading order. */
export function namesOf(node: Node): string[] {
  const out: string[] = [];
  const walk = (n: Node): void => {
    switch (n.kind) {
      case "var":
        if (!out.includes(n.name)) out.push(n.name);
        break;
      case "neg":
        walk(n.arg);
        break;
      case "bin":
        walk(n.left);
        walk(n.right);
        break;
      case "call":
        n.args.forEach(walk);
        break;
      case "num":
        break;
    }
  };
  walk(node);
  return out;
}

// ── reading a printed answer back in ────────────────────────────────

/** An operand: something a `*` can be inserted in front of. */
const OPERAND_END = /[A-Za-z0-9_)\]]/;

/**
 * Insert the `*` signs a student leaves out. The parser reads identifiers
 * greedily, so "mv" arrives as one name and has to become "m*v" before it can
 * mean anything.
 *
 * Identifiers are consumed whole first, which is the only way to tell
 * "sqrt(2)/t" (a function call) from "m(x)/y" (a product) — by the time the
 * bracket appears the letters have already been decided about.
 */
export function splitImplicitProducts(src: string): string {
  let out = "";
  let lastWord: string | undefined;
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      const word = src.slice(i, j);
      const isFunc = FORM_FUNCS[word] !== undefined;
      const isCall = isFunc && src[j] === "(";
      // "mv" is m·v, but "v0" and "m2" are single subscripted symbols
      const emit = !isFunc && word.length > 1 && !/\d/.test(word) ? word.split("").join("*") : word;
      if (out && !isCall && OPERAND_END.test(out[out.length - 1])) out += "*";
      out += emit;
      lastWord = word;
      i = j;
      continue;
    }
    if (out) {
      const prev = out[out.length - 1];
      // a bracket opening a known function is an argument list, not a product
      if (ch === "(" && lastWord !== undefined && FORM_FUNCS[lastWord] === undefined) {
        out += "*";
      } else if (prev === ")" && /[A-Za-z0-9_(]/.test(ch)) {
        out += "*";
      }
    }
    out += ch;
    lastWord = undefined;
    i++;
  }
  return out;
}

/**
 * Read a printed algebraic answer back into an expression, so a multiple-choice
 * option written `m v^2 / r` can be compared with our own `mv²/r`. Returns
 * undefined for anything that isn't an algebraic expression — a choice reading
 * "10.7 N" has no symbols to compare.
 */
export function parseChoiceExpression(text: string): Sym | undefined {
  let s = text;
  // "F = mv²/r" — the right-hand side is the answer
  const eq = s.indexOf("=");
  if (eq >= 0) s = s.slice(eq + 1);
  s = s.replace(/²/g, "^2").replace(/³/g, "^3").replace(/¹/g, "^1");
  // any run of three or more letters is prose or a word, not an expression —
  // "half of m" is not an algebraic answer, and guessing at one would let it
  // collide with a real option
  for (const word of s.match(/[A-Za-z]{3,}/g) ?? []) {
    if (FORM_FUNCS[word] === undefined) return undefined;
  }
  // keep only what an expression may contain
  s = s.replace(/[^A-Za-z0-9_^()+\-*/.\s]/g, " ");
  s = s.replace(/·/g, "*").replace(/×/g, "*").replace(/\s+/g, "");
  if (!s || !/[A-Za-z]/.test(s)) return undefined;
  s = splitImplicitProducts(s);
  try {
    const node = parseForm(s);
    const names = namesOf(node);
    // "10.7 N" and "2.4 m/s" are values with units, not algebraic answers.
    // Only reject when EVERY identifier is a unit — `m` is both a metre and the
    // mass symbol, and in "mv²/r" it is plainly the latter.
    if (names.length && names.every(isUnitName)) return undefined;
    const env: Record<string, Sym> = {};
    for (const name of names) env[name] = vari(name);
    const result = evalSym(node, env);
    // nothing symbolic in it — there is nothing for a symbolic answer to match
    if (symbolsOf(result).length === 0) return undefined;
    return result;
  } catch {
    return undefined;
  }
}

/**
 * Fold an expression to a number, or `undefined` if any symbol is still free.
 * `subs` supplies values for symbols the answer left open, which is how "mv²/r"
 * can also report "10.7 N" when m, v and r happen to be known.
 */
export function materialize(s: Sym, subs: Record<string, number> = {}): number | undefined {
  if (isNum(s)) return s;
  switch (s.kind) {
    case "num":
      return s.value;
    case "var": {
      const v = subs[s.name] ?? FORM_CONSTANTS[s.name];
      return v === undefined ? undefined : v;
    }
    case "neg": {
      const a = materialize(s.arg, subs);
      return a === undefined ? undefined : -a;
    }
    case "bin": {
      const l = materialize(s.left, subs);
      if (l === undefined) return undefined;
      const r = materialize(s.right, subs);
      if (r === undefined) return undefined;
      switch (s.op) {
        case "+": return l + r;
        case "-": return l - r;
        case "*": return l * r;
        case "/": return l / r;
        case "^": return l ** r;
        default: return undefined;
      }
    }
    case "call": {
      const args = s.args.map((a) => materialize(a, subs));
      if (!args.every((a): a is number => a !== undefined)) return undefined;
      const fn = FORM_FUNCS[s.name];
      return fn ? fn(...args) : undefined;
    }
  }
}

/** The free symbols in an expression, in a stable order. */
export function symbolsOf(s: Sym): string[] {
  const out: string[] = [];
  const walk = (n: Expr): void => {
    if (n.kind === "var") {
      if (!out.includes(n.name)) out.push(n.name);
    } else if (n.kind === "neg") walk(n.arg);
    else if (n.kind === "bin") {
      walk(n.left);
      walk(n.right);
    } else if (n.kind === "call") n.args.forEach(walk);
  };
  walk(asExpr(s));
  return out;
}

// ── printing ────────────────────────────────────────────────────────

/** Numerator and denominator factors of one flattened product. */
interface Fraction {
  numer: Expr[];
  denom: Expr[];
}

/** Flatten a `*` / `/` chain into numerator and denominator factors. */
function collectFraction(s: Expr, into: Fraction, inverted: boolean): void {
  if (s.kind === "bin" && (s.op === "*" || s.op === "/")) {
    collectFraction(s.left, into, inverted);
    collectFraction(s.right, into, inverted !== (s.op === "/"));
    return;
  }
  if (s.kind === "neg") {
    // a negated factor contributes a -1 to the numerator
    const inner: Fraction = { numer: [], denom: [] };
    collectFraction(s.arg, inner, inverted);
    into.numer.push(num(-1), ...inner.numer, ...inner.denom);
    return;
  }
  if (s.kind === "num" && s.value === 1 && inverted) return; // "…/1" prints as "…"
  (inverted ? into.denom : into.numer).push(s);
}

/** Render one factor; `supers` prints exponents as ² and ³ as students do. */
function renderFactor(f: Expr, supers: boolean): string {
  if (f.kind === "num") return String(f.value);
  if (f.kind === "var") return SYMBOL_DISPLAY[f.name] ?? f.name;
  if (f.kind === "neg") return `-${renderFactor(f.arg, supers)}`;
  if (f.kind === "call") return renderCall(f);
  if (f.kind === "bin" && f.op === "^" && f.right.kind === "num") {
    const base = renderFactor(f.left, false);
    return supers ? `${base}${superscript(f.right.value)}` : `${base}^${f.right.value}`;
  }
  return renderSym(f);
}

function renderCall(f: Extract<Expr, { kind: "call" }>): string {
  // a compound argument needs its own brackets: √(mg/r), never √mg/r
  const args = f.args.map((a) => {
    const s = renderSym(a);
    return s.includes(" ") || s.includes("/") || s.includes("+") ? `(${s})` : s;
  });
  const inner = args.join(", ");
  if (f.name === "sqrt") return `√${inner}`;
  if (f.name === "cbrt") return `∛${inner}`;
  return `${f.name}(${inner})`;
}

/**
 * Render a `Sym` the way a student would write it: factors in the order the
 * equation sheet states them (so `m*g` reads "mg", not "gm"), exponents as
 * superscripts, and a reciprocal coefficient shown as a denominator.
 */
export function renderSym(s: Sym): string {
  if (isNum(s)) return String(s);
  if (s.kind === "num") return String(s.value);
  if (s.kind === "var") return SYMBOL_DISPLAY[s.name] ?? s.name;
  if (s.kind === "neg") return `-${renderSym(s.arg)}`;
  if (s.kind === "call") return renderCall(s);
  if (s.kind === "bin" && (s.op === "+" || s.op === "-")) {
    return `${renderSym(s.left)}${s.op === "+" ? " + " : " − "}${renderSym(s.right)}`;
  }
  if (s.kind === "bin" && s.op === "^") return renderFactor(s, true);
  const frac = flatten(s);
  const numer = renderProduct(frac.numer);
  if (!frac.denom.length) return numer;
  return `${numer}/${frac.denom.map((d) => renderFactor(d, true)).join("·")}`;
}

/**
 * Split a product into numerator and denominator, moving any coefficient that
 * is a clean reciprocal into the denominator — "1/2·m·v²" prints "mv²/2".
 */
function flatten(s: Expr): Fraction {
  const frac: Fraction = { numer: [], denom: [] };
  collectFraction(s, frac, false);
  const numer: Expr[] = [];
  for (const f of frac.numer) {
    if (f.kind === "num" && f.value !== 0) {
      const inv = 1 / f.value;
      if (Number.isInteger(inv) && Math.abs(inv) > 1) {
        frac.denom.push(num(inv));
        continue;
      }
    }
    numer.push(f);
  }
  frac.numer = numer;
  return frac;
}

/**
 * Factors that are all short and free of operators run together the way
 * textbook notation does — "mv²", "mg", "2m" — while anything compound keeps
 * an explicit separator so "9.8·m" and "√2·m" stay unambiguous.
 */
const RUN_TOGETHER = /^[A-Za-z0-9_²³¹⁰]+$/;

function renderProduct(factors: Expr[]): string {
  if (!factors.length) return "1";
  const shown = factors[0].kind === "num" && factors[0].value === 1 ? factors.slice(1) : factors;
  if (!shown.length) return "1";
  const parts = shown.map((f) => renderFactor(f, true));
  const runsTogether = parts.every((p) => p.length <= 3 && RUN_TOGETHER.test(p));
  return runsTogether ? parts.join("") : parts.join("·");
}

/**
 * The canonical form used to decide whether a printed choice means the same
 * thing as our answer: lowercase, no spaces, no multiplication dots, sorted
 * factors, `^n` kept as an exponent. `m v^2/r`, `mv²/r` and `m*v^2/r` all
 * collapse to the same string, while `2mv²/r` does not.
 */
export function canonical(s: Sym): string {
  if (isNum(s)) return numKey(s);
  switch (s.kind) {
    case "num":
      return numKey(s.value);
    case "var":
      return (SYMBOL_DISPLAY[s.name] ?? s.name).toLowerCase();
    case "neg":
      return `-${canonical(s.arg)}`;
    case "call":
      return `${s.name}(${s.args.map(canonical).join(",")})`;
    case "bin": {
      // an exponent is an atomic factor, not a product to flatten — treating it
      // as one would feed the same node back through this function forever
      if (s.op === "^" && s.right.kind === "num") {
        return `${canonical(s.left)}^${s.right.value}`;
      }
      if (s.op === "+" || s.op === "-") {
        return `${canonical(s.left)}${s.op}${canonical(s.right)}`;
      }
      const frac = flatten(s);
      const n = frac.numer.map(canonical).sort();
      const d = frac.denom.map(canonical).sort();
      return d.length ? `${n.join("*") || "1"}/${d.join("*")}` : n.join("*");
    }
  }
}

function numKey(v: number): string {
  // 0.5 and 1/2 are the same answer; normalize decimals so a choice written
  // either way collapses together
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(10)));
}
