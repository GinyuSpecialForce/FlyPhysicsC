import { describe, expect, it } from "vitest";
import { trainNetwork } from "../src/core/train";
import { FlyBrain } from "../src/core/brain";
import { constantAnswer } from "../src/core/constant-answers";
import {
  CONSTANTS,
  allConstants,
  constant,
  resolveWorldName,
  suppliedConstants,
  valueOf,
  worldG,
  WORLDS,
} from "../src/core/constant-table";

const G = valueOf("G");

describe("constants table", () => {
  it("is the single source of the numbers the circuits already used", () => {
    expect(valueOf("G")).toBe(6.67e-11);
    expect(valueOf("g_std")).toBe(9.8);
    expect(valueOf("K_E")).toBe(8.99e9);
    expect(valueOf("E_CHARGE")).toBe(1.6e-19);
    expect(valueOf("M_earth")).toBe(5.97e24);
    expect(valueOf("R_earth")).toBe(6.37e6);
    expect(valueOf("M_moon")).toBe(7.342e22);
    expect(valueOf("d_moon")).toBe(3.844e8);
    expect(valueOf("M_sun")).toBe(1.989e30);
    expect(valueOf("d_earth_sun")).toBe(1.496e11);
  });

  it("has unique ids and a display string for every entry", () => {
    const all = allConstants();
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    for (const c of all) {
      expect(c.display.length, c.id).toBeGreaterThan(3);
      expect(c.name.length, c.id).toBeGreaterThan(2);
      expect(c.unit.length, c.id).toBeGreaterThan(0);
    }
    expect(all.length).toBeGreaterThanOrEqual(CONSTANTS.length);
  });

  it("gives every body a surface gravity of GM/R² (Earth being the AP 9.8)", () => {
    expect(worldG("earth")).toBe(9.8);
    expect(worldG("mars")).toBeCloseTo((G * WORLDS.mars.mass) / WORLDS.mars.radius ** 2, 6);
    expect(worldG("jupiter")).toBeCloseTo(24.8, 0);
    expect(worldG("moon")).toBeCloseTo(1.62, 2);
    expect(worldG(undefined)).toBe(9.8);
    expect(worldG("nowhere")).toBe(9.8);
  });

  it("prefers a named body over Earth", () => {
    expect(resolveWorldName("900 N on earth … the same weight on Pluto?")).toBe("pluto");
    expect(resolveWorldName("what is g on the moon")).toBe("moon");
    expect(resolveWorldName("a spring and a block")).toBeUndefined();
  });

  it("supplies the constants a phrasing implies", () => {
    const cases: Array<[string, string[]]> = [
      ["What is the surface gravity of Mercury?", ["g_mercury", "M_mercury", "R_mercury"]],
      ["A satellite orbits Earth at 500 km. What is its speed?", ["M_earth", "G"]],
      ["How much does a 70 kg person weigh on the Moon?", ["g_moon", "M_moon"]],
      ["A spring with k = 300 N/m is compressed 0.20 m.", []],
      ["A 3 kg ball on a frictionless surface is pulled with 40 N.", []],
    ];
    for (const [text, ids] of cases) {
      const got = suppliedConstants(text).map((s) => s.constant.id);
      for (const id of ids) expect(got, text).toContain(id);
    }
  });

  it("every supplied constant explains itself", () => {
    for (const { constant: c, reason } of suppliedConstants("What is g on Jupiter?")) {
      expect(reason.length).toBeGreaterThan(3);
      expect(Number.isFinite(c.value), c.id).toBe(true);
    }
  });

  it("answers direct questions about the table", () => {
    const cases: Array<[string, number, string]> = [
      ["What is g on Mars?", worldG("mars"), "m/s²"],
      ["What is the acceleration due to gravity on Jupiter?", worldG("jupiter"), "m/s²"],
      ["What is the mass of Jupiter?", WORLDS.jupiter.mass, "kg"],
      ["What is the radius of Mars?", WORLDS.mars.radius, "m"],
      ["What is the mass of the Sun?", valueOf("M_sun"), "kg"],
      ["How much does a 70 kg person weigh on the Moon?", 70 * worldG("moon"), "N"],
      ["What is the escape velocity of Earth?", Math.sqrt(2 * 9.8 * WORLDS.earth.radius), "m/s"],
      ["What is the value of G?", G, "N·m²/kg²"],
      ["What is the value of g?", 9.8, "m/s²"],
      ["What is Coulomb's constant?", valueOf("K_E"), "N·m²/C²"],
      ["What is the elementary charge?", valueOf("E_CHARGE"), "C"],
      ["What is the orbital speed of Mars around the Sun?", Math.sqrt((G * valueOf("M_sun")) / WORLDS.mars.sunDistance!), "m/s"],
      ["How long is a year on Mars?", WORLDS.mars.year!, "s"],
    ];
    for (const [text, expected, unit] of cases) {
      const got = constantAnswer(text);
      expect(got, text).toBeDefined();
      expect(got!.value, text).toBeCloseTo(expected, Math.max(2, -Math.log10(Math.abs(expected) * 0.01)));
      expect(got!.unit, text).toBe(unit);
      expect(got!.primary.display.length, text).toBeGreaterThan(0);
    }
  });

  it("leaves ordinary physics problems to the circuits", () => {
    const cases = [
      "A 60 kilogram person stands on Earth. What is their weight?",
      "A 3.0 kg ball is whirled at 8.0 m/s on a 2.0 m rope. What is the centripetal force?",
      "As the Moon orbits the Earth it reaches a point between the Earth and the Sun. Determine the net force of gravity on the Moon at this point.",
      "A planet has twice Earth's mass and half Earth's radius. What is g at its surface?",
      "A 900 N weight is lifted 3.0 m. What work is done?",
    ];
    for (const text of cases) expect(constantAnswer(text), text).toBeUndefined();
  });

  it("end to end: the fly answers a constants question and cites its source", () => {
    const brain = new FlyBrain(trainNetwork(1337, 6).network);
    const rec = brain.solveFreeform("What is g on Mars?");
    expect(rec.computedAnswer).toMatch(/m\/s²$/);
    const compute = rec.stages.find((s) => s.id === "compute")!;
    expect(compute.details.join(" ")).toContain("constants table");
    expect(compute.summary).toContain("m/s²");
  });

  it("the reference constants are the ones the fly solves with", () => {
    // a citation must name a constant that actually exists in the table
    const g = constant("g_mars");
    expect(g).toBeDefined();
    expect(g!.display).toContain("m/s²");
    expect(g!.derived).toBe("g = GM/R²");
  });
});
