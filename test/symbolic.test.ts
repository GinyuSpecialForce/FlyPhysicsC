import { describe, expect, it } from "vitest";
import {
  canonical,
  materialize,
  parseChoiceExpression,
  renderSym,
  splitImplicitProducts,
  symbolicOf,
  symbolsOf,
} from "../src/core/symbolic";
import { tokenize, tokenizeVars } from "../src/core/tokenizer";
import { rescueSolve } from "../src/core/dimension-solver";
import { buildFeatureVector } from "../src/core/features";
import { FlyBrain } from "../src/core/brain";
import { trainNetwork } from "../src/core/train";

/** A free variable standing for the problem's own symbol of that name. */
const v = (name: string) => ({ kind: "var", name }) as never;

const render = (form: string, env: Record<string, unknown>): string =>
  renderSym(symbolicOf(form, env as never)!);

describe("symbolic evaluation", () => {
  it("prints a familiar relation the way a student writes it", () => {
    expect(render("m*v^2/r", { m: v("m"), v: v("v"), r: v("r") })).toBe("mv²/r");
    expect(render("v/t", { v: v("v"), t: v("t") })).toBe("v/t");
    expect(render("v^2", { v: v("v") })).toBe("v²");
  });

  it("keeps a tabulated constant as its symbol rather than its value", () => {
    // a tension reads "mg", not "m·9.8"
    expect(render("m*g", { m: v("m") })).toBe("mg");
  });

  it("parenthesizes a compound root instead of swallowing it", () => {
    expect(render("sqrt(m*g/r)", { m: v("m") })).toBe("√(mg/r)");
  });

  it("shows a reciprocal coefficient as a denominator", () => {
    expect(render("1/2*m*v^2", { m: v("m"), v: v("v") })).toBe("mv²/2");
  });

  it("folds to a number exactly when every leaf is known", () => {
    expect(render("m*v^2/r", { m: 2, v: 4, r: 3 })).toBe("10.666666666666666");
    const sym = symbolicOf("m*v^2/r", { m: v("m"), v: v("v"), r: 3 })!;
    expect(materialize(sym, { m: 2, v: 4 })).toBeCloseTo(10.666666666, 8);
    expect(materialize(sym, { m: 2 })).toBeUndefined();
  });

  it("drops identities that would only clutter the printed answer", () => {
    expect(render("m*1*v", { m: v("m"), v: v("v") })).toBe("mv");
    expect(render("m/1", { m: v("m") })).toBe("m");
    expect(render("m^1", { m: v("m") })).toBe("m");
  });

  it("keeps a tabulated constant symbolic in the text but resolves it in the value", () => {
    const sym = symbolicOf("m*g/r", { m: v("m"), r: v("r") })!;
    // "g" is listed because that is how the answer is written…
    expect(symbolsOf(sym)).toEqual(["m", "g", "r"]);
    // …but the fly still knows what it is worth
    expect(materialize(sym, { m: 2, r: 4 })).toBeCloseTo(4.9, 10);
  });
});

describe("canonical form for comparing expressions", () => {
  it("is blind to the order the factors were written in", () => {
    const a = parseChoiceExpression("m*v^2/r")!;
    const b = parseChoiceExpression("v^2*m/r")!;
    expect(canonical(a)).toBe(canonical(b));
  });

  it("still tells a different answer apart", () => {
    expect(canonical(parseChoiceExpression("2*m*v^2/r")!)).not.toBe(
      canonical(parseChoiceExpression("m*v^2/r")!),
    );
  });
});

describe("reading a printed option back in", () => {
  it("sees through the ways the same expression gets written", () => {
    const target = canonical(parseChoiceExpression("mv²/r")!);
    for (const spelling of ["mv²/r", "m v^2 / r", "m*v^2/r", "F = mv²/r"]) {
      const parsed = parseChoiceExpression(spelling);
      expect(parsed, spelling).toBeDefined();
      expect(canonical(parsed!), spelling).toBe(target);
    }
  });

  it("refuses a value with a unit — there are no symbols to compare", () => {
    expect(parseChoiceExpression("10.7 N")).toBeUndefined();
    expect(parseChoiceExpression("2.4 m/s")).toBeUndefined();
  });

  it("refuses prose rather than guessing at an expression in it", () => {
    expect(parseChoiceExpression("half of m")).toBeUndefined();
    expect(parseChoiceExpression("1/2 of the original energy")).toBeUndefined();
  });

  it("does not mistake a function call for a product", () => {
    expect(splitImplicitProducts("sqrt(2)/t")).toBe("sqrt(2)/t");
    expect(splitImplicitProducts("m(x)/y")).toBe("m*(x)/y");
  });

  it("reads a multi-letter run as a product but keeps a subscripted symbol whole", () => {
    expect(splitImplicitProducts("mv^2/r")).toBe("m*v^2/r");
    expect(splitImplicitProducts("qE")).toBe("q*E");
    expect(splitImplicitProducts("v0/r")).toBe("v0/r");
  });
});

describe("named variables in the problem text", () => {
  it("reads an explicit assignment as both a symbol and a value", () => {
    const { declared } = tokenizeVars("A mass m = 2.0 kg moves at v = 4.0 m/s.");
    const m = declared.find((d) => d.symbol === "m");
    expect(m?.family).toBe("mass");
    expect(m?.value).toBe(2);
  });

  it("reads a cue word as a declaration of kind", () => {
    const { declared } = tokenizeVars("A spring of spring constant k holds a mass m.");
    const k = declared.find((d) => d.symbol === "k");
    expect(k?.family).toBe("spring-k");
    expect(declared.some((d) => d.symbol === "m" && d.family === "mass")).toBe(true);
  });

  it("collects the symbols a question asks to be answered in terms of", () => {
    expect(tokenizeVars("Find F in terms of m, v and r.").enumerated).toEqual(["m", "v", "r"]);
    expect(tokenizeVars("In terms of m and v, what is the force?").enumerated).toEqual(["m", "v"]);
  });

  it("never invents a symbol out of an ordinary quantity", () => {
    // the dangerous cases: a bare unit after a number, and a unit after a
    // vague word. Neither is a variable.
    expect(tokenizeVars("A block travels 3.0 m in 5 s.").declared).toEqual([]);
    expect(tokenizeVars("A mass of 2.0 kg accelerates.").declared).toEqual([]);
  });

  it("needs a specific cue — a bare 'field' is too vague to declare E", () => {
    // "charge q" is a real declaration; "a field E" could be electric or
    // magnetic, so the fly declines to guess and leaves E alone
    const { declared } = tokenizeVars("A charge q in a field E.");
    expect(declared.map((d) => d.symbol)).toEqual(["q"]);
    expect(declared.find((d) => d.symbol === "q")?.family).toBe("charge");
  });

  it("leaves the numeric tokenizer's output completely untouched", () => {
    // the network's feature vector is built from tokenize() alone; reading
    // symbols must not be able to perturb it
    const text = "A block of mass m = 2.0 kg moves at v = 4.0 m/s in a circle of radius 3.0 m.";
    const before = buildFeatureVector(tokenize(text).slots, tokenize(text).keywordHits);
    tokenizeVars(text);
    const after = buildFeatureVector(tokenize(text).slots, tokenize(text).keywordHits);
    expect(after).toEqual(before);
  });
});

describe("rescuing an answer in terms of variables", () => {
  const text =
    "A block of mass m = 2.0 kg moves at speed v = 4.0 m/s in a circle of radius 3.0 m. Find the centripetal force in terms of m, v and r.";

  function rescue(t: string, wantSymbolic: boolean) {
    const vars = tokenizeVars(t);
    return rescueSolve({
      slots: tokenize(t).slots,
      text: t,
      wanted: ["force"],
      rankedTopics: ["rotation", "kinematics"],
      circuitTopic: "rotation",
      vars,
      wantSymbolic,
    });
  }

  it("gives the expression AND the number it comes to", () => {
    const r = rescue(text, true);
    expect(r?.display).toBe("F_c = mv²/r");
    expect(r?.symbolic?.expression).toBe("mv²/r");
    expect(r?.symbolic?.variables).toEqual(["m", "v", "r"]);
    expect(r?.value).toBeCloseTo(10.666666666, 8);
  });

  it("uses the problem's own letter for a quantity", () => {
    const t = text.replace("mass m =", "mass M =").replace("in terms of m,", "in terms of M,");
    expect(rescue(t, true)?.symbolic?.expression).toBe("Mv²/r");
  });

  it("produces no symbolic answer at all when none was asked for", () => {
    const plain =
      "A block of mass 2.0 kg moves at 4.0 m/s in a circle of radius 3.0 m. What is the centripetal force?";
    const r = rescue(plain, false);
    expect(r?.value).toBeCloseTo(10.666666666, 8);
    expect(r?.symbolic).toBeUndefined();
  });

  it("declines rather than inventing a symbol the problem never gave", () => {
    const t = "Find the centripetal force in terms of m, v and r.";
    expect(rescue(t, true)).toBeUndefined();
  });
});

describe("the fly answering a symbolic question", () => {
  const brain = new FlyBrain(trainNetwork(1337, 6).network);

  it("answers in terms of the named variables, and still gives the number", () => {
    const rec = brain.solveFreeform(
      "A block of mass m = 2.0 kg moves at speed v = 4.0 m/s in a circle of radius 3.0 m. Find the centripetal force in terms of m, v and r.",
    );
    expect(rec.computedSymbolic).toBe("mv²/r");
    expect(rec.computedAnswer).toBe("10.7 N");
    const answer = rec.stages.find((s) => s.id === "answer");
    expect(answer?.summary).toContain("mv²/r");
    expect(answer?.summary).toContain("10.7 N");
  });

  it("picks the option that spells the same expression", () => {
    const rec = brain.solveFreeform(
      [
        "A block of mass m = 2.0 kg moves at speed v = 4.0 m/s in a circle of radius 3.0 m.",
        "Find the centripetal force in terms of m, v and r.",
        "(A) m v / r        (B) 2 m v^2 / r",
        "(C) m v^2 / r      (D) m v^2 / 2 r",
      ].join("\n"),
    );
    expect(rec.answerIndex).toBe(2);
  });

  it("does not confuse a doubled or halved distractor for the right one", () => {
    const rec = brain.solveFreeform(
      [
        "A block of mass m = 2.0 kg moves at speed v = 4.0 m/s in a circle of radius 3.0 m.",
        "Find the centripetal force in terms of m, v and r.",
        "(A) m v^2 / r      (B) 2 m v^2 / r",
        "(C) m v / r        (D) m v^2",
      ].join("\n"),
    );
    expect(rec.answerIndex).toBe(0);
  });

  it("leaves an ordinary numeric question exactly as it was", () => {
    const rec = brain.solveFreeform(
      "A block of mass 2.0 kg moves at 4.0 m/s in a circle of radius 3.0 m. What is the centripetal force?",
    );
    expect(rec.computedAnswer).toBe("10.7 N");
    expect(rec.computedSymbolic).toBeNull();
  });
});
