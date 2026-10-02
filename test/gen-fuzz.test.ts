import { describe, it, expect } from "vitest";
import { generateProblem } from "../src/core/bank";
import { TOPIC_LIST } from "../src/core/features";
import { Rng } from "../src/core/rng";

describe("generator fuzz", () => {
  it("always produces 5 string choices and a valid answer index", () => {
    const rng = new Rng(99);
    for (const topic of TOPIC_LIST) {
      for (let i = 0; i < 500; i++) {
        const p = generateProblem(topic, rng);
        expect(p.choices.length).toBe(5);
        expect(p.answer).toBeGreaterThanOrEqual(0);
        expect(p.answer).toBeLessThan(5);
        for (const c of p.choices) expect(typeof c.text).toBe("string");
      }
    }
  });
});
