import { describe, it, expect } from "vitest";
import { trainNetwork } from "../src/core/train";
import { FlyBrain } from "../src/core/brain";
import { buildFreeformProblem, FREEFORM_PROBLEM } from "../src/core/freeform";
import { makeBrain } from "../src/core/lesions";
import { fmt } from "../src/core/format";

describe("freeform questions (typed by the user, no answer key)", () => {
  const { network } = trainNetwork(1337, 6);

  it("solves a typed kinetic-energy question end to end", () => {
    const brain = new FlyBrain(network);
    const rec = brain.solveFreeform("A 3 kg ball moves at 8 m/s. What is its kinetic energy?");
    expect(rec.problem.origin).toBe("user");
    expect(rec.problem.choices).toHaveLength(0);
    expect(rec.problem.answer).toBe(-1);
    expect(rec.computedAnswer).toBe("96 J"); // ½·3·8²
    expect(rec.stages.at(-1)!.summary).toContain("96 J");
    expect(rec.stages.at(-1)!.summary.startsWith("Answer:")).toBe(true);
    expect(rec.correct).toBe(false); // never graded
  });

  it("classifies and routes typed questions sensibly", () => {
    const brain = new FlyBrain(network);
    const cases: Array<[string, string]> = [
      ["A 5 kg crate is pulled with 40 N across a frictionless surface. What is its acceleration?", "newton"],
      ["A 1500 kg car moves at 20 m/s. What is its momentum?", "momentum"],
      ["A 0.5 kg block on a spring with k = 300 N/m is stretched 0.1 m. How much energy is stored?", "energy"],
    ];
    for (const [text, topic] of cases) {
      const rec = brain.solveFreeform(text);
      expect(rec.predicted, text).toBe(topic);
      expect(rec.circuit, text).toBe(topic);
      expect(rec.computedAnswer, text).not.toBeNull();
    }
  });

  it("states an unsolvable question honestly instead of guessing", () => {
    const brain = new FlyBrain(network);
    const rec = brain.solveFreeform("Why is the sky blue?");
    expect(rec.computedAnswer).toBeNull();
    expect(rec.stages.at(-1)!.summary).toContain("couldn't");
  });

  it("solve(FREEFORM_PROBLEM) re-returns the persisted record", () => {
    const brain = new FlyBrain(network);
    const rec = brain.solveFreeform("A 2 kg mass falls 4 m. How much energy does it gain?");
    expect(brain.solve(FREEFORM_PROBLEM)).toBe(rec);
  });

  it("lesions apply to freeform questions too", () => {
    const motor = makeBrain(network, { type: "motor" });
    const recMotor = motor.solveFreeform("A 3 kg ball moves at 8 m/s. What is its kinetic energy?");
    expect(recMotor.computedAnswer).toBeUndefined();
    expect(recMotor.stages.at(-1)!.summary).toContain("lesioned");

    const mb = makeBrain(network, { type: "mushroom-bodies" });
    const recMb = mb.solveFreeform("A 3 kg ball moves at 8 m/s. What is its kinetic energy?");
    expect(recMb.predicted).not.toBe("energy"); // flat guesses: chance is 1/12
  });

  it("solves worded-unit and question-phrased variants (robustness)", () => {
    const brain = new FlyBrain(network);
    const cases = [
      "A 1500 kilogram car moves at 20 meters per second. What is its momentum?",
      "A battery of 6 volts drives a 12 ohm resistor. What is the current?",
      "A force of 40 newtons pushes a 5 kilogram crate. What is its acceleration?",
      "A 4 kg ball moves at 5 meters per second. What is its kinetic energy?",
      "A 2 coulomb charge sits 1 meter from a 3 coulomb charge. What is the force between them?",
    ];
    for (const text of cases) {
      const rec = brain.solveFreeform(text);
      expect(rec.computedAnswer, text).not.toBeNull();
    }
  });

  it("buildFreeformProblem rejects empty input and normalizes whitespace", () => {
    expect(() => buildFreeformProblem("   ")).toThrow();
    const p = buildFreeformProblem("  a  3 kg   ball…  ");
    expect(p.text).toBe("a 3 kg ball…");
  });

  it("fmt renders plain decimals between 1 and 1e5 (no e+ notation)", () => {
    expect(fmt(30000)).toBe("30000");
    expect(fmt(96)).toBe("96");
    expect(fmt(4.9)).toBe("4.9");
    expect(fmt(0.005)).toContain("×10");
    expect(fmt(120000)).toContain("×10");
  });
});
