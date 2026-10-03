import { describe, expect, it } from "vitest";
import { EQUATIONS, FLAT_ENTRIES, FORM_CONSTANTS, sheetDisplays } from "../src/core/equation-sheet";
import { evalNode, formDimension, parseForm } from "../src/core/dimension-solver";
import { CONSTANT_DIMENSION, FAMILY_UNIT, dimOf } from "../src/core/units";

/**
 * The sheet is data the fly both cites and solves from, so it has to be right
 * in the arithmetic sense: every entry must parse, and the dimension of its
 * form must equal the dimension of the family it claims to produce.
 */
describe("equation sheet", () => {
  it("covers all twelve circuits' sections", () => {
    expect(EQUATIONS.length).toBeGreaterThanOrEqual(50);
    const sections = new Set(EQUATIONS.map((e) => e.section));
    expect(sections.size).toBeGreaterThanOrEqual(12);
    for (const equation of EQUATIONS) {
      expect(equation.topics.length).toBeGreaterThan(0);
      for (const topic of equation.topics) expect(typeof topic).toBe("string");
    }
  });

  it("every form parses and every variable has a real unit family", () => {
    for (const { equation, entry } of FLAT_ENTRIES) {
      expect(() => parseForm(entry.form), `${equation.id} ${entry.display}`).not.toThrow();
      for (const [key, family] of Object.entries(entry.vars)) {
        expect(dimOf(family), `${equation.id}: ${key} → ${family}`).toBeDefined();
      }
      expect(entry.vars[entry.target], `${equation.id} has no target family`).toBeDefined();
    }
  });

  it("every form's dimension matches the family it claims to produce", () => {
    const bad: string[] = [];
    for (const { equation, entry } of FLAT_ENTRIES) {
      const declared = dimOf(entry.vars[entry.target])!;
      const actual = formDimension(parseForm(entry.form), entry.vars as Record<string, string>);
      if (!actual) {
        bad.push(`${equation.id} ${entry.display}: undimensionable`);
        continue;
      }
      if (actual.some((v, i) => v !== declared[i])) {
        bad.push(`${equation.id} ${entry.display}: form is [${actual}] but ${entry.vars[entry.target]} is [${declared}]`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("every constant a form may use has a value and a dimension", () => {
    for (const name of Object.keys(FORM_CONSTANTS)) {
      expect(Number.isFinite(FORM_CONSTANTS[name]), name).toBe(true);
      expect(CONSTANT_DIMENSION[name], `${name} has no dimension`).toBeDefined();
    }
  });

  it("the family's own SI dimensions agree with the sheet's constants", () => {
    // F = Gm₁m₂/r² must produce newtons, and g must come out in m/s²
    expect(dimOf("force")).toEqual([1, 1, -2, 0]);
    expect(dimOf("acceleration")).toEqual([0, 1, -2, 0]);
    expect(dimOf("voltage")).toEqual([1, 2, -3, -1]);
    expect(dimOf("charge")).toEqual([0, 0, 1, 1]);
    expect(dimOf("capacitance")).toEqual([-1, -2, 4, 2]);
    expect(dimOf("resistance")).toEqual([1, 2, -3, -2]);
    expect(dimOf("inductance")).toEqual([1, 2, -2, -2]);
  });

  it("every declared default really is one of those constants", () => {
    for (const { equation, entry } of FLAT_ENTRIES) {
      for (const [key, fallback] of Object.entries(entry.defaults ?? {})) {
        expect(Object.keys(FORM_CONSTANTS), `${equation.id}.${key}`).toContain(fallback);
      }
    }
  });

  it("every family a sheet can answer has a unit the fly can print", () => {
    const families = new Set(FLAT_ENTRIES.flatMap(({ entry }) => Object.values(entry.vars)));
    for (const family of families) {
      expect(FAMILY_UNIT[family as keyof typeof FAMILY_UNIT], family).toBeDefined();
    }
  });

  it("inverse directions round-trip to the same number", () => {
    // a_c = v²/r ⟹ v = √(a_c·r) ⟹ back again
    const bindings = { v: 12, r: 5, ac: (12 * 12) / 5, m: 3, F: 86.4 };
    const acEntry = FLAT_ENTRIES.find((f) => f.equation.id === "circ.ac" && f.entry.target === "ac")!.entry;
    const vEntry = FLAT_ENTRIES.find((f) => f.equation.id === "circ.ac" && f.entry.target === "v")!.entry;
    const ac = evalNode(parseForm(acEntry.form), bindings);
    const v = evalNode(parseForm(vEntry.form), { ...bindings, ac });
    expect(ac).toBeCloseTo(28.8, 10);
    expect(v).toBeCloseTo(12, 10);

    // F_c = mv²/r ⟹ v = √(F_c·r/m)
    const fc = FLAT_ENTRIES.find((f) => f.equation.id === "circ.Fc" && f.entry.target === "F")!.entry;
    const inv = FLAT_ENTRIES.find(
      (f) => f.equation.id === "circ.Fc" && f.entry.form === "sqrt(F*r/m)",
    )!.entry;
    const F = evalNode(parseForm(fc.form), bindings);
    expect(evalNode(parseForm(inv.form), { ...bindings, F })).toBeCloseTo(12, 10);
  });

  it("the reference tab lists every distinct equation once", () => {
    const displays = sheetDisplays().map((d) => d.display);
    expect(displays.length).toBeGreaterThanOrEqual(50);
    expect(new Set(displays).size).toBe(displays.length);
  });
});
