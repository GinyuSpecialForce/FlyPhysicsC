/**
 * Advanced reasoning circuits for AP Physics C:
 *   1. Symbolic & numerical Calculus (`d/dt`, `d/dx`, definite integrals `∫ dt` / `∫ dx`)
 *      over polynomial, trigonometric, and exponential functions (`x(t)`, `v(t)`,
 *      `a(t)`, `F(t)`, `F(x)`, `q(t)`, `I(t)`, `Φ(t)`, `U(x)`).
 *   2. Proportional & Scaling reasoning ("Planet X has twice the mass and three
 *      times the radius of Earth…", "if the speed is tripled…").
 *   3. 2D Vector decomposition & superposition (cardinal directions `east/north/west/south`,
 *      unit vectors `+x/-x/+y/-y`, `i^ / j^`, and angled forces/velocities/momenta).
 */
import { FLAT_ENTRIES } from "./equation-sheet";
import { parseForm, type Node } from "./form-ast";
import { evalNode } from "./dimension-solver";
import { takeAll, type SolveCtx } from "./extract";
import type { Slot } from "./features";
import { fmt } from "./format";
import { G_ACC } from "./constants";
import type { SolveResult } from "./topics/index";

export interface ReasoningAnswer extends SolveResult {
  /** Human-readable explanation of the reasoning step for the thought timeline */
  how: string;
  /** The equation or calculus relation applied */
  equation: string;
}

// ══════════════════════════════════════════════════════════════════════
// 1. AP Physics C Calculus Engine (Differentiation & Definite Integration)
// ══════════════════════════════════════════════════════════════════════

/** Symbolic derivative of an AST node with respect to variable `v`. */
export function diffAst(node: Node, v: string): Node {
  switch (node.kind) {
    case "num":
      return { kind: "num", value: 0 };
    case "var":
      return { kind: "num", value: node.name === v ? 1 : 0 };
    case "neg":
      return simplifyNode({ kind: "neg", arg: diffAst(node.arg, v) });
    case "bin": {
      const { op, left, right } = node;
      if (op === "+" || op === "-") {
        return simplifyNode({
          kind: "bin",
          op,
          left: diffAst(left, v),
          right: diffAst(right, v),
        });
      }
      if (op === "*") {
        // Product rule: (u·w)' = u'·w + u·w'
        return simplifyNode({
          kind: "bin",
          op: "+",
          left: simplifyNode({ kind: "bin", op: "*", left: diffAst(left, v), right }),
          right: simplifyNode({ kind: "bin", op: "*", left, right: diffAst(right, v) }),
        });
      }
      if (op === "/") {
        // Quotient rule: (u/w)' = (u'·w - u·w') / w^2
        return simplifyNode({
          kind: "bin",
          op: "/",
          left: simplifyNode({
            kind: "bin",
            op: "-",
            left: simplifyNode({ kind: "bin", op: "*", left: diffAst(left, v), right }),
            right: simplifyNode({ kind: "bin", op: "*", left, right: diffAst(right, v) }),
          }),
          right: simplifyNode({ kind: "bin", op: "^", left: right, right: { kind: "num", value: 2 } }),
        });
      }
      if (op === "^" && right.kind === "num") {
        // Power + chain rule: (u^n)' = n · u^(n-1) · u'
        const n = right.value;
        if (n === 0) return { kind: "num", value: 0 };
        const basePow: Node =
          n === 2
            ? left
            : { kind: "bin", op: "^", left, right: { kind: "num", value: n - 1 } };
        return simplifyNode({
          kind: "bin",
          op: "*",
          left: simplifyNode({ kind: "bin", op: "*", left: { kind: "num", value: n }, right: basePow }),
          right: diffAst(left, v),
        });
      }
      return { kind: "num", value: 0 };
    }
    case "call": {
      const arg = node.args[0];
      if (!arg) return { kind: "num", value: 0 };
      const dArg = diffAst(arg, v);
      if (node.name === "sin") {
        return simplifyNode({
          kind: "bin",
          op: "*",
          left: { kind: "call", name: "cos", args: [arg] },
          right: dArg,
        });
      }
      if (node.name === "cos") {
        return simplifyNode({
          kind: "neg",
          arg: simplifyNode({
            kind: "bin",
            op: "*",
            left: { kind: "call", name: "sin", args: [arg] },
            right: dArg,
          }),
        });
      }
      if (node.name === "exp") {
        return simplifyNode({
          kind: "bin",
          op: "*",
          left: { kind: "call", name: "exp", args: [arg] },
          right: dArg,
        });
      }
      return { kind: "num", value: 0 };
    }
  }
}

function simplifyNode(n: Node): Node {
  if (n.kind === "neg") {
    if (n.arg.kind === "num") return { kind: "num", value: -n.arg.value };
    if (n.arg.kind === "neg") return n.arg.arg;
    return n;
  }
  if (n.kind === "bin") {
    const l = simplifyNode(n.left);
    const r = simplifyNode(n.right);
    if (l.kind === "num" && r.kind === "num") {
      switch (n.op) {
        case "+": return { kind: "num", value: l.value + r.value };
        case "-": return { kind: "num", value: l.value - r.value };
        case "*": return { kind: "num", value: l.value * r.value };
        case "/": return { kind: "num", value: l.value / r.value };
        case "^": return { kind: "num", value: l.value ** r.value };
      }
    }
    if (n.op === "+") {
      if (l.kind === "num" && l.value === 0) return r;
      if (r.kind === "num" && r.value === 0) return l;
    }
    if (n.op === "-") {
      if (r.kind === "num" && r.value === 0) return l;
      if (l.kind === "num" && l.value === 0) return simplifyNode({ kind: "neg", arg: r });
    }
    if (n.op === "*") {
      if ((l.kind === "num" && l.value === 0) || (r.kind === "num" && r.value === 0)) {
        return { kind: "num", value: 0 };
      }
      if (l.kind === "num" && l.value === 1) return r;
      if (r.kind === "num" && r.value === 1) return l;
    }
    if (n.op === "^") {
      if (r.kind === "num" && r.value === 1) return l;
      if (r.kind === "num" && r.value === 0) return { kind: "num", value: 1 };
    }
    return { kind: "bin", op: n.op, left: l, right: r };
  }
  return n;
}

/**
 * Composite Simpson's rule for definite integrals ∫_a^b f(v) dv.
 * Exact for polynomials up to degree 3 and accurate to >10 digits on smooth functions.
 */
export function integrateAst(node: Node, v: string, a: number, b: number, steps = 200): number {
  if (a === b) return 0;
  const n = steps % 2 === 0 ? steps : steps + 1;
  const h = (b - a) / n;
  const f = (val: number) => evalNode(node, { [v]: val });
  let sum = f(a) + f(b);
  for (let i = 1; i < n; i++) {
    sum += (i % 2 === 1 ? 4 : 2) * f(a + i * h);
  }
  return (h / 3) * sum;
}

/** Normalize a human-written algebraic formula in `t` or `x` into a `parseForm`-ready string. */
function normalizeFunctionBody(raw: string, indepVar: string): string {
  let s = raw
    .trim()
    // strip trailing units or punctuation like "m", "m/s", "N", "Wb", "."
    .replace(/\s*(?:m\/s²|m\/s2|m\/s|rad\/s²|rad\/s|kg·m\/s|N|J|C|A|V|Wb|m)\b[.,;)]*$/i, "")
    .replace(/[.,;]+$/, "")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/⁴/g, "^4")
    .replace(/[−–—]/g, "-")
    .replace(/\s+/g, "");
  // Insert explicit `*` between coefficient and variable/function: "3t^2" → "3*t^2", "4sin(2t)" → "4*sin(2*t)"
  const vEsc = indepVar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  s = s.replace(new RegExp(`(\\d)(${vEsc})\\b`, "g"), "$1*$2");
  s = s.replace(/(\d)(sin|cos|tan|exp|sqrt)\b/g, "$1*$2");
  s = s.replace(new RegExp(`(\\))(${vEsc}|\\d)`, "g"), "$1*$2");
  return s;
}

const FUNC_DECL_RE =
  /\b([xvafqIΦU])\s*(?:\(\s*([tx])\s*\))?\s*=\s*([-+0-9tx.^*/()\s²³⁴sincotaexp]+?)(?=\s*(?:where\b|with\b|in\s+meters|in\s+seconds|in\s+newtons|in\s+coulombs|in\s+webers|at\s+[tx]\s*=|from\s+[tx]\s*=|between\s+[tx]\s*=|[.;,?]|$))/i;

/**
 * Solve AP Physics C calculus problems:
 *   - Derivative chains: x(t) → v(t) → a(t); q(t) → I(t); Φ(t) → ε = |N dΦ/dt|; U(x) → F = -dU/dx; p(t) → F = dp/dt
 *   - Integral chains: a(t) → Δv; v(t) → Δx; F(t) → J (impulse) or Δv; F(x) → W (work); I(t) → Δq; P(t) → E
 */
export function calculusAnswer(ctx: SolveCtx, question: string): ReasoningAnswer | undefined {
  const text = ctx.text;
  const m = FUNC_DECL_RE.exec(text);
  if (!m) return undefined;

  const lhsRaw = m[1];
  const lhs = lhsRaw === "Φ" ? "Phi" : lhsRaw;
  const indep = (m[2] ?? (/\bx\b/.test(m[3]) && !/\bt\b/.test(m[3]) ? "x" : "t")).toLowerCase();
  const rhsRaw = m[3];
  // Must actually depend on the independent variable (`t` or `x`) to be a calculus function
  if (!new RegExp(`\\b${indep}\\b|\\d${indep}`).test(rhsRaw)) return undefined;

  const cleaned = normalizeFunctionBody(rhsRaw, indep);
  let ast: Node;
  try {
    ast = parseForm(cleaned);
  } catch {
    return undefined;
  }

  const q = question.toLowerCase();
  const lower = text.toLowerCase();

  // Extract evaluation point `at t = 2` / `at x = 3` or interval `from t = 0 to t = 3`
  const intervalMatch =
    lower.match(
      new RegExp(
        `(?:from|between)\\s+(?:${indep}\\s*=\\s*)?(-?[\\d.]+)\\s*(?:s|seconds?|m|meters?)?\\s+(?:to|and)\\s+(?:${indep}\\s*=\\s*)?(-?[\\d.]+)`,
      ),
    ) ??
    lower.match(/from\s+t\s*=\s*(-?[\d.]+)\s*to\s*(-?[\d.]+)/);

  const atMatch =
    lower.match(new RegExp(`(?:at|when|for)\\s+${indep}\\s*=\\s*(-?[\\d.]+)`)) ??
    lower.match(new RegExp(`${indep}\\s*=\\s*(-?[\\d.]+)`));

  const times = takeAll(ctx.slots, "time");
  const lengths = takeAll(ctx.slots, "length");
  const evalPoint =
    atMatch !== null
      ? parseFloat(atMatch[1])
      : indep === "t" && times.length === 1
        ? times[0]
        : indep === "x" && lengths.length === 1
          ? lengths[0]
          : undefined;

  try {
    // ── Position x(t) given ──
    if (lhs.toLowerCase() === "x" && indep === "t") {
      const vAst = diffAst(ast, "t");
      const aAst = diffAst(vAst, "t");
      if (/acceleration|accelerate/.test(q) && evalPoint !== undefined) {
        const val = evalNode(aAst, { t: evalPoint });
        return {
          value: val,
          unit: "m/s²",
          equation: "a(t) = d²x/dt²",
          how: `Differentiated x(t) twice and evaluated at t = ${evalPoint} s`,
        };
      }
      if (/velocity|speed|how fast/.test(q)) {
        if (/average/.test(q) && intervalMatch) {
          const [t1, t2] = [parseFloat(intervalMatch[1]), parseFloat(intervalMatch[2])];
          const val = (evalNode(ast, { t: t2 }) - evalNode(ast, { t: t1 })) / (t2 - t1);
          return {
            value: val,
            unit: "m/s",
            equation: "v_avg = Δx/Δt",
            how: `Evaluated (x(${t2}) − x(${t1})) / (${t2} − ${t1})`,
          };
        }
        if (evalPoint !== undefined) {
          const val = evalNode(vAst, { t: evalPoint });
          return {
            value: /speed/.test(q) ? Math.abs(val) : val,
            unit: "m/s",
            equation: "v(t) = dx/dt",
            how: `Differentiated x(t) and evaluated at t = ${evalPoint} s`,
          };
        }
      }
      if (/force/.test(q) && evalPoint !== undefined) {
        const masses = takeAll(ctx.slots, "mass");
        if (masses.length === 1) {
          const val = masses[0] * evalNode(aAst, { t: evalPoint });
          return {
            value: val,
            unit: "N",
            equation: "F = m·d²x/dt²",
            how: `Differentiated x(t) twice for a(${evalPoint}) and multiplied by m = ${masses[0]} kg`,
          };
        }
      }
    }

    // ── Velocity v(t) given ──
    if (lhs.toLowerCase() === "v" && indep === "t") {
      if (/acceleration|accelerate/.test(q) && evalPoint !== undefined) {
        const aAst = diffAst(ast, "t");
        const val = evalNode(aAst, { t: evalPoint });
        return {
          value: val,
          unit: "m/s²",
          equation: "a(t) = dv/dt",
          how: `Differentiated v(t) and evaluated at t = ${evalPoint} s`,
        };
      }
      if (/displacement|how far|distance|position/.test(q)) {
        const [t1, t2] = intervalMatch
          ? [parseFloat(intervalMatch[1]), parseFloat(intervalMatch[2])]
          : evalPoint !== undefined
            ? [0, evalPoint]
            : [NaN, NaN];
        if (Number.isFinite(t1) && Number.isFinite(t2)) {
          const val = integrateAst(ast, "t", t1, t2);
          return {
            value: val,
            unit: "m",
            equation: "Δx = ∫ v(t) dt",
            how: `Integrated v(t) from t = ${t1} s to t = ${t2} s`,
          };
        }
      }
    }

    // ── Acceleration a(t) given ──
    if (lhs.toLowerCase() === "a" && indep === "t") {
      if (/velocity|speed|change in velocity/.test(q)) {
        const [t1, t2] = intervalMatch
          ? [parseFloat(intervalMatch[1]), parseFloat(intervalMatch[2])]
          : evalPoint !== undefined
            ? [0, evalPoint]
            : [NaN, NaN];
        if (Number.isFinite(t1) && Number.isFinite(t2)) {
          const dv = integrateAst(ast, "t", t1, t2);
          const vels = takeAll(ctx.slots, "velocity");
          const v0 = vels[0] ?? 0;
          return {
            value: v0 + dv,
            unit: "m/s",
            equation: "v = v₀ + ∫ a(t) dt",
            how: `Integrated a(t) from t = ${t1} s to t = ${t2} s`,
          };
        }
      }
    }

    // ── Time-varying force F(t) or position-varying force F(x) ──
    if (lhs.toLowerCase() === "f") {
      if (indep === "t" && /impulse|momentum|velocity|speed/.test(q)) {
        const [t1, t2] = intervalMatch
          ? [parseFloat(intervalMatch[1]), parseFloat(intervalMatch[2])]
          : evalPoint !== undefined
            ? [0, evalPoint]
            : [NaN, NaN];
        if (Number.isFinite(t1) && Number.isFinite(t2)) {
          const impulse = integrateAst(ast, "t", t1, t2);
          if (/velocity|speed/.test(q)) {
            const masses = takeAll(ctx.slots, "mass");
            if (masses.length === 1) {
              const vels = takeAll(ctx.slots, "velocity");
              const v0 = vels[0] ?? 0;
              return {
                value: v0 + impulse / masses[0],
                unit: "m/s",
                equation: "Δv = (1/m) ∫ F(t) dt",
                how: `Integrated F(t) from ${t1} to ${t2} s for impulse J = ${fmt(impulse)} N·s, then divided by m`,
              };
            }
          }
          return {
            value: impulse,
            unit: "kg·m/s",
            equation: "J = ∫ F(t) dt",
            how: `Integrated F(t) from t = ${t1} s to t = ${t2} s`,
          };
        }
      }
      if (indep === "x" && /work|energy|speed|velocity/.test(q)) {
        const [x1, x2] = intervalMatch
          ? [parseFloat(intervalMatch[1]), parseFloat(intervalMatch[2])]
          : evalPoint !== undefined
            ? [0, evalPoint]
            : [NaN, NaN];
        if (Number.isFinite(x1) && Number.isFinite(x2)) {
          const work = integrateAst(ast, "x", x1, x2);
          if (/speed|velocity/.test(q)) {
            const masses = takeAll(ctx.slots, "mass");
            if (masses.length === 1 && work >= 0) {
              return {
                value: Math.sqrt((2 * work) / masses[0]),
                unit: "m/s",
                equation: "½mv² = ∫ F(x) dx",
                how: `Integrated F(x) from x = ${x1} m to ${x2} m for W = ${fmt(work)} J, then solved ½mv² = W`,
              };
            }
          }
          return {
            value: work,
            unit: "J",
            equation: "W = ∫ F(x) dx",
            how: `Integrated F(x) from x = ${x1} m to x = ${x2} m`,
          };
        }
      }
    }

    // ── Potential energy U(x) → Force F = -dU/dx ──
    if (lhs.toLowerCase() === "u" && indep === "x" && /force/.test(q) && evalPoint !== undefined) {
      const dU = diffAst(ast, "x");
      const val = -evalNode(dU, { x: evalPoint });
      return {
        value: /magnitude/.test(q) ? Math.abs(val) : val,
        unit: "N",
        equation: "F(x) = −dU/dx",
        how: `Differentiated U(x) and negated at x = ${evalPoint} m`,
      };
    }

    // ── Charge q(t) → Current I(t) = dq/dt ──
    if (lhs.toLowerCase() === "q" && indep === "t" && /current/.test(q) && evalPoint !== undefined) {
      const iAst = diffAst(ast, "t");
      const val = evalNode(iAst, { t: evalPoint });
      return {
        value: val,
        unit: "A",
        equation: "I(t) = dq/dt",
        how: `Differentiated q(t) and evaluated at t = ${evalPoint} s`,
      };
    }

    // ── Current I(t) → Charge Δq = ∫ I(t) dt or Induced EMF ε = L dI/dt ──
    if (lhs.toLowerCase() === "i" && indep === "t") {
      if (/charge/.test(q)) {
        const [t1, t2] = intervalMatch
          ? [parseFloat(intervalMatch[1]), parseFloat(intervalMatch[2])]
          : evalPoint !== undefined
            ? [0, evalPoint]
            : [NaN, NaN];
        if (Number.isFinite(t1) && Number.isFinite(t2)) {
          const val = integrateAst(ast, "t", t1, t2);
          return {
            value: val,
            unit: "C",
            equation: "ΔQ = ∫ I(t) dt",
            how: `Integrated I(t) from t = ${t1} s to t = ${t2} s`,
          };
        }
      }
      if (/emf|voltage/.test(q) && evalPoint !== undefined) {
        const inds = takeAll(ctx.slots, "inductance");
        if (inds.length === 1) {
          const di = evalNode(diffAst(ast, "t"), { t: evalPoint });
          return {
            value: Math.abs(inds[0] * di),
            unit: "V",
            equation: "ε = L|dI/dt|",
            how: `Differentiated I(t) at t = ${evalPoint} s and multiplied by L = ${inds[0]} H`,
          };
        }
      }
    }

    // ── Magnetic flux Φ(t) → Induced EMF ε = N |dΦ/dt| ──
    if (lhs === "Phi" && indep === "t" && /emf|voltage|current/.test(q) && evalPoint !== undefined) {
      const dPhi = evalNode(diffAst(ast, "t"), { t: evalPoint });
      const turns = takeAll(ctx.slots, "turns")[0] ?? 1;
      const emf = Math.abs(turns * dPhi);
      if (/current/.test(q)) {
        const res = takeAll(ctx.slots, "resistance");
        if (res.length === 1) {
          return {
            value: emf / res[0],
            unit: "A",
            equation: "I = (N/R)|dΦ/dt|",
            how: `Differentiated Φ(t) at t = ${evalPoint} s for ε = ${fmt(emf)} V, then divided by R`,
          };
        }
      }
      return {
        value: emf,
        unit: "V",
        equation: "ε = N|dΦ_B/dt|",
        how: `Differentiated Φ(t) and evaluated at t = ${evalPoint} s`,
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

// ══════════════════════════════════════════════════════════════════════
// 2. Proportional & Scaling Reasoning Engine ("doubles", "triples", "halved")
// ══════════════════════════════════════════════════════════════════════

const SCALE_WORDS: ReadonlyArray<readonly [RegExp, number]> = [
  [/\b(?:quadrupled|quadruples|four\s+times)\b/i, 4],
  [/\b(?:tripled|triples|three\s+times)\b/i, 3],
  [/\b(?:doubled|doubles|twice(?:\s+as\s+\w+)?|two\s+times)\b/i, 2],
  [/\b(?:halved|halves|half(?:\s+the|\s+as\s+\w+)?|one[- ]half)\b/i, 0.5],
  [/\b(?:one[- ]third|reduced\s+to\s+a\s+third)\b/i, 1 / 3],
  [/\b(?:one[- ]fourth|one[- ]quarter|quartered)\b/i, 0.25],
];

const QUANTITY_NOUNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bmass\b/i, "mass"],
  [/\b(?:radius|distance|separation|apart|length)\b/i, "length"],
  [/\b(?:speed|velocity)\b/i, "velocity"],
  [/\b(?:charge)\b/i, "charge"],
  [/\b(?:current)\b/i, "current"],
  [/\b(?:voltage|potential\s+difference)\b/i, "voltage"],
  [/\b(?:resistance)\b/i, "resistance"],
  [/\b(?:capacitance)\b/i, "capacitance"],
  [/\b(?:spring\s+constant|stiffness)\b/i, "spring-k"],
  [/\b(?:angular\s+velocity|angular\s+speed)\b/i, "angular-vel"],
];

/**
 * Solve proportional scaling questions:
 *   - "Planet X has twice the mass and three times the radius of Earth. What is its surface gravity in m/s²?"
 *   - "A car moving with kinetic energy 100 J doubles its speed. What is its new kinetic energy?"
 *   - "If the distance between two charges is tripled and one charge is doubled, by what factor does the force change?"
 */
export function scalingAnswer(ctx: SolveCtx, question: string): ReasoningAnswer | undefined {
  const text = ctx.text;
  const lower = text.toLowerCase();
  if (!SCALE_WORDS.some(([re]) => re.test(lower))) return undefined;

  // Extract (family → multiplier) pairs from clauses in the text
  const clauses = lower.split(/[,;.]|\band\b|\bwhile\b|\bbut\b/);
  const familyFactors = new Map<string, number[]>();

  for (const clause of clauses) {
    let factor: number | undefined;
    for (const [re, mult] of SCALE_WORDS) {
      if (re.test(clause)) {
        factor = mult;
        break;
      }
    }
    if (factor === undefined) continue;
    for (const [nounRe, fam] of QUANTITY_NOUNS) {
      if (nounRe.test(clause)) {
        const list = familyFactors.get(fam) ?? [];
        list.push(factor);
        familyFactors.set(fam, list);
      }
    }
  }

  if (familyFactors.size === 0) return undefined;

  const q = question.toLowerCase();

  // Case A: Relative surface gravity on a scaled planet ("Planet X has twice the mass and 2 times the radius of Earth. What is its surface gravity?")
  if (
    /surface\s+gravity|acceleration\s+due\s+to\s+gravity|\bg\b/.test(q) &&
    (familyFactors.has("mass") || familyFactors.has("length"))
  ) {
    const mMult = familyFactors.get("mass")?.[0] ?? 1;
    const rMult = familyFactors.get("length")?.[0] ?? 1;
    const ratio = mMult / (rMult * rMult);
    if (/factor|ratio|relative\s+to/.test(q)) {
      return {
        value: ratio,
        unit: "×",
        equation: "g ∝ M/R²",
        how: `Scaled g by M×${mMult} / R²×${rMult}² = ${fmt(ratio)}`,
      };
    }
    const baseG = ctx.slots.find((s) => s.unit === "acceleration")?.value ?? G_ACC;
    return {
      value: baseG * ratio,
      unit: "m/s²",
      equation: "g' = g · (M'/M) / (R'/R)²",
      how: `Scaled Earth's g (${baseG} m/s²) by (${mMult})/(${rMult})² = ${fmt(ratio)}`,
    };
  }

  // Case B: Escape speed on a scaled planet ("twice the mass and half the radius of Earth")
  if (/escape\s+(?:speed|velocity)/.test(q) && (familyFactors.has("mass") || familyFactors.has("length"))) {
    const mMult = familyFactors.get("mass")?.[0] ?? 1;
    const rMult = familyFactors.get("length")?.[0] ?? 1;
    const ratio = Math.sqrt(mMult / rMult);
    const vels = takeAll(ctx.slots, "velocity");
    if (vels.length === 1) {
      return {
        value: vels[0] * ratio,
        unit: "m/s",
        equation: "v_esc ∝ √(M/R)",
        how: `Scaled initial escape speed by √(${mMult}/${rMult})`,
      };
    }
    if (/factor/.test(q)) {
      return {
        value: ratio,
        unit: "×",
        equation: "v_esc ∝ √(M/R)",
        how: `Scaled by √(${mMult}/${rMult})`,
      };
    }
  }

  // Case C: General scaling of a baseline quantity given in `slots` (or pure factor question)
  // Find which target family the question asks about
  const targetMap: ReadonlyArray<readonly [RegExp, string, string]> = [
    [/kinetic\s+energy/, "energy", "K = ½mv²"],
    [/spring\s+(?:potential\s+)?energy|elastic\s+potential/, "energy", "U_s = ½kx²"],
    [/centripetal\s+acceleration/, "acceleration", "a_c = v²/r"],
    [/centripetal\s+force/, "force", "F_c = mv²/r"],
    [/gravitational\s+force|force\s+of\s+gravity/, "force", "F = Gm₁m₂/r²"],
    [/electric\s+force|electrostatic\s+force|coulomb/, "force", "F = kq₁q₂/r²"],
    [/power\s+dissipated|electric(?:al)?\s+power/, "power", "P = V²/R"],
    [/period.*pendulum|pendulum.*period/, "time", "T = 2π√(L/g)"],
    [/period.*spring|spring.*period/, "time", "T = 2π√(m/k)"],
    [/momentum/, "momentum", "p = mv"],
  ];

  for (const [re, targetFam, eqDisplay] of targetMap) {
    if (!re.test(lower)) continue;
    const flat = FLAT_ENTRIES.find((f) => f.entry.display.startsWith(eqDisplay.split(" ")[0]) && f.entry.vars[f.entry.target] === targetFam);
    if (!flat) continue;

    // Evaluate form at all-1s vs scaled factors (with constants set to 1 so they cancel in the ratio)
    const ast = parseForm(flat.entry.form);
    const baseBindings: Record<string, number> = { G: 1, g: 1, kE: 1, pi: 1 };
    const scaledBindings: Record<string, number> = { G: 1, g: 1, kE: 1, pi: 1 };
    const familyCursor = new Map<string, number>();

    for (const [varName, fam] of Object.entries(flat.entry.vars)) {
      if (varName === flat.entry.target) continue;
      baseBindings[varName] = 1;
      const list = familyFactors.get(fam);
      const idx = familyCursor.get(fam) ?? 0;
      const mult = list ? (list[idx] ?? list[0] ?? 1) : 1;
      familyCursor.set(fam, idx + 1);
      scaledBindings[varName] = mult;
    }

    const baseVal = evalNode(ast, baseBindings);
    const scaledVal = evalNode(ast, scaledBindings);
    if (!Number.isFinite(baseVal) || !Number.isFinite(scaledVal) || baseVal === 0) continue;
    const ratio = scaledVal / baseVal;

    // If a baseline value of the target family is present in `slots`, scale it!
    const existingTarget = takeAll(ctx.slots, targetFam);
    if (existingTarget.length === 1) {
      const unitMap: Record<string, string> = {
        energy: "J",
        acceleration: "m/s²",
        force: "N",
        power: "W",
        time: "s",
        momentum: "kg·m/s",
      };
      return {
        value: existingTarget[0] * ratio,
        unit: unitMap[targetFam] ?? "m",
        equation: eqDisplay,
        how: `Scaled ${existingTarget[0]} by factor ${fmt(ratio)} using ${eqDisplay}`,
      };
    }

    if (/by\s+what\s+factor|what\s+factor/.test(q)) {
      return {
        value: ratio,
        unit: "×",
        equation: eqDisplay,
        how: `Evaluated scaling ratio ${fmt(ratio)} from ${eqDisplay}`,
      };
    }
  }

  return undefined;
}

// ══════════════════════════════════════════════════════════════════════
// 3. 2D Vector Decomposition & Superposition
// ══════════════════════════════════════════════════════════════════════

function dirToVec(dir: NonNullable<Slot["dir"]>): [number, number] {
  switch (dir) {
    case "east":
    case "+x":
      return [1, 0];
    case "west":
    case "-x":
      return [-1, 0];
    case "north":
    case "+y":
      return [0, 1];
    case "south":
    case "-y":
      return [0, -1];
  }
}

/**
 * Solve 2D vector problems where two or more quantities carry cardinal or
 * coordinate-axis directions:
 *   - Net force / acceleration from perpendicular or opposing forces ("10 N east and 24 N north on a 2 kg mass")
 *   - 2D inelastic collisions ("A 2 kg ball moving east at 3 m/s collides and sticks to a 2 kg ball moving north at 4 m/s")
 *   - Resultant displacement or velocity ("walks 30 m east then 40 m north")
 */
export function vector2dAnswer(ctx: SolveCtx, question: string): ReasoningAnswer | undefined {
  const directed = ctx.slots.filter((s) => s.dir !== undefined);
  if (directed.length < 2) return undefined;
  const q = question.toLowerCase();
  const lower = ctx.text.toLowerCase();

  // ── 2D Force superposition: F_net = √(Fx² + Fy²), a = F_net / m ──
  const dirForces = directed.filter((s) => s.unit === "force");
  if (dirForces.length >= 2) {
    let fx = 0;
    let fy = 0;
    for (const f of dirForces) {
      const [dx, dy] = dirToVec(f.dir!);
      fx += f.value * dx;
      fy += f.value * dy;
    }
    const fNet = Math.hypot(fx, fy);
    if (/acceleration|accelerate/.test(q)) {
      const masses = takeAll(ctx.slots, "mass");
      if (masses.length === 1) {
        return {
          value: fNet / masses[0],
          unit: "m/s²",
          equation: "a = √(F_x² + F_y²) / m",
          how: `Summed 2D forces (F_x = ${fmt(fx)} N, F_y = ${fmt(fy)} N) → |F_net| = ${fmt(fNet)} N, divided by m = ${masses[0]} kg`,
        };
      }
    }
    if (/force|resultant|magnitude/.test(q)) {
      return {
        value: fNet,
        unit: "N",
        equation: "F_net = √(F_x² + F_y²)",
        how: `Summed 2D force components (F_x = ${fmt(fx)} N, F_y = ${fmt(fy)} N)`,
      };
    }
  }

  // ── 2D Inelastic Collision / Momentum Superposition ──
  const dirVels = directed.filter((s) => s.unit === "velocity");
  const masses = takeAll(ctx.slots, "mass");
  if (dirVels.length === 2 && masses.length === 2 && /collide|stick|stuck|inelastic|total\s+momentum/.test(lower)) {
    const [dx1, dy1] = dirToVec(dirVels[0].dir!);
    const [dx2, dy2] = dirToVec(dirVels[1].dir!);
    const px = masses[0] * dirVels[0].value * dx1 + masses[1] * dirVels[1].value * dx2;
    const py = masses[0] * dirVels[0].value * dy1 + masses[1] * dirVels[1].value * dy2;
    const pMag = Math.hypot(px, py);
    const vf = pMag / (masses[0] + masses[1]);
    if (/momentum/.test(q)) {
      return {
        value: pMag,
        unit: "kg·m/s",
        equation: "|p| = √(p_x² + p_y²)",
        how: `Combined 2D momenta (p_x = ${fmt(px)}, p_y = ${fmt(py)} kg·m/s)`,
      };
    }
    if (/speed|velocity|how fast/.test(q)) {
      return {
        value: vf,
        unit: "m/s",
        equation: "v_f = √((m₁v₁_x + m₂v₂_x)² + (m₁v₁_y + m₂v₂_y)²) / (m₁ + m₂)",
        how: `Conserved 2D momentum (|p| = ${fmt(pMag)} kg·m/s) and divided by total mass ${masses[0] + masses[1]} kg`,
      };
    }
  }

  // ── 2D Displacement ("walks 30 m east and 40 m north") ──
  const dirLengths = directed.filter((s) => s.unit === "length");
  if (dirLengths.length >= 2 && /displacement|how\s+far|distance\s+from\s+(?:the\s+)?start|magnitude/.test(q)) {
    let rx = 0;
    let ry = 0;
    for (const l of dirLengths) {
      const [dx, dy] = dirToVec(l.dir!);
      rx += l.value * dx;
      ry += l.value * dy;
    }
    const disp = Math.hypot(rx, ry);
    const times = takeAll(ctx.slots, "time");
    if (/velocity/.test(q) && times.length === 1) {
      const totalTime = times.reduce((a, b) => a + b, 0);
      return {
        value: disp / totalTime,
        unit: "m/s",
        equation: "|v_avg| = √(Δx² + Δy²) / Δt",
        how: `Computed 2D resultant displacement ${fmt(disp)} m over ${totalTime} s`,
      };
    }
    return {
      value: disp,
      unit: "m",
      equation: "|Δr| = √(Δx² + Δy²)",
      how: `Summed 2D displacements (Δx = ${fmt(rx)} m, Δy = ${fmt(ry)} m)`,
    };
  }

  return undefined;
}
