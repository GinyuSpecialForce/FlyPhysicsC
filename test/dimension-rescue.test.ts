import { describe, expect, it } from "vitest";
import { trainNetwork } from "../src/core/train";
import { FlyBrain, wantedUnits } from "../src/core/brain";
import { rescueSolve } from "../src/core/dimension-solver";
import { tokenize, familyForUnit } from "../src/core/tokenizer";
import { TOPIC_LIST, buildFeatureVector } from "../src/core/features";
import { blendPriors, keywordPriors } from "../src/core/priors";
import { Network } from "../src/core/network";
import { Rng } from "../src/core/rng";
import type { UnitFamily } from "../src/core/units";

/** Run the rescue exactly as the brain does, minus the circuits. */
function rescue(text: string) {
  const { slots, keywordHits } = tokenize(text);
  const net = new Network(new Rng(1337));
  const input = buildFeatureVector(slots, keywordHits);
  const probs = blendPriors(net.forward(input).probs, keywordPriors(text, TOPIC_LIST));
  const rankedTopics = TOPIC_LIST.filter((t) => probs[TOPIC_LIST.indexOf(t)] >= 0).sort(
    (a, b) => probs[TOPIC_LIST.indexOf(b)] - probs[TOPIC_LIST.indexOf(a)],
  );
  const wanted = wantedUnits(text)?.map((u) => familyForUnit(u)).filter((f): f is UnitFamily => !!f);
  return rescueSolve({
    slots,
    text,
    wanted: wanted?.length ? wanted : undefined,
    rankedTopics,
    circuitTopic: rankedTopics[0],
  });
}

describe("dimensional rescue", () => {
  it("solves phrasings no hand-written circuit covers", () => {
    const cases: Array<[string, number, string]> = [
      // centripetal force from a speed, radius and mass
      ["A 3.0 kg ball is whirled at 8.0 m/s on a 2.0 m rope. What is the centripetal force?", 96, "N"],
      // spring
      ["A spring with k = 300 N/m is compressed 0.20 m. What force does it exert?", 60, "N"],
      // capacitor charge
      ["A 10 uF capacitor is charged to 12 V. What charge does it hold?", 1.2e-4, "C"],
      // circuit power from current and resistance
      ["A resistor of 100 ohms carries 0.25 A. What is the power dissipated?", 6.25, "W"],
      // Faraday
      [
        "A loop of 200 turns and area 0.010 m2 has flux 0.05 Wb that goes to zero in 0.10 s. What emf is induced?",
        100,
        "V",
      ],
      // magnetic force on a proton
      ["A proton moves at 2.0e6 m/s in a 0.50 T magnetic field. What force acts on it?", 1.6e-13, "N"],
      // spring period
      ["What is the period of a 2.0 kg mass on a spring with k = 50 N/m?", 2 * Math.PI * Math.sqrt(2 / 50), "s"],
      // pendulum period
      ["A pendulum of length 1.2 m swings on Earth. What is its period?", 2 * Math.PI * Math.sqrt(1.2 / 9.8), "s"],
      // universal gravitation between two masses
      ["What is the gravitational force between two 1.0 kg masses 1.0 m apart?", 6.67e-11, "N"],
      // work done lifting a weight
      ["A 900 N weight is lifted 3.0 m. What work is done?", 2700, "J"],
      // Kepler backwards: radius from the period
      [
        "A satellite of mass 1000 kg orbits a planet and takes 2.0 hours per revolution. What is its orbital radius?",
        Math.cbrt((6.67e-11 * 5.97e24 * 7200 ** 2) / (4 * Math.PI ** 2)),
        "m",
      ],
    ];
    for (const [text, expected, unit] of cases) {
      const got = rescue(text);
      expect(got, text).toBeDefined();
      expect(got!.value, text).toBeCloseTo(expected, Math.max(2, -Math.log10(Math.abs(expected) * 0.01)));
      expect(got!.unit, text).toBe(unit);
      expect(got!.display.length, text).toBeGreaterThan(0);
    }
  });

  it("declines rather than guess", () => {
    // each of these has a quantity the sheet cannot bind, or asks for a
    // quantity the sheet cannot produce — a number here would be a fabrication
    const cases = [
      "A 2.0 kg ball is thrown straight up at 20 m/s. How long until it returns?", // needs T = 2v₀/g
      "A 60 kg person slows from 20 m/s to a stop over 5 s. What average force acted on them?", // needs Δp
      "A 4.0 kg object moving at 6.0 m/s hits a stationary 2.0 kg object and they stick together. What is their speed afterward?", // needs v₂ = 0
      "A satellite orbits Earth at an altitude of 400 km. What is its orbital speed?", // r = R⊕ + h
      "A hoop of mass 5 kg and radius 0.5 m spins at 3 rad/s. What is its rotational kinetic energy? (I = MR²)", // no inertia slot
    ];
    for (const text of cases) {
      expect(rescue(text), text).toBeUndefined();
    }
  });

  it("never uses an orbiting object's own mass as the central mass", () => {
    // the 1000 kg is the satellite's; M must be Earth's
    const got = rescue(
      "A 1000 kg satellite orbits a planet and takes 2.0 hours per revolution. What is its orbital radius?",
    );
    expect(got).toBeDefined();
    expect(got!.value).toBeGreaterThan(1e6); // a real orbital radius, not 1000-something
    expect(got!.bindings.M).toBeCloseTo(5.97e24, -20);
  });

  it("never mistakes a radius for a drop height", () => {
    expect(
      rescue("A hoop of mass 5 kg and radius 0.5 m spins at 3 rad/s. What is its gravitational potential energy?"),
    ).toBeUndefined();
  });

  it("end to end: the brain rescues a problem its circuits could not bind", () => {
    const brain = new FlyBrain(trainNetwork(1337, 6).network);
    const rec = brain.solveFreeform(
      "A 1000 kg satellite orbits a planet and takes 2.0 hours per revolution. What is its orbital radius?",
    );
    expect(rec.computedAnswer).toMatch(/m$/);
    const compute = rec.stages.find((s) => s.id === "compute")!;
    expect(compute.details.join(" ")).toContain("No circuit covered this");
    expect(compute.details.join(" ")).toContain("Gravitation");
  });

  it("cites the equation sheet for answers the circuits do produce", () => {
    const brain = new FlyBrain(trainNetwork(1337, 6).network);
    const cited = [
      ["A 900 N weight is lifted 3.0 m. What work is done?", "W = Fd"],
      ["A spring with k = 300 N/m is compressed 0.20 m. What force does it exert?", "F_s"],
      ["A 10 uF capacitor is charged to 12 V. What charge does it hold?", "Q = C"],
    ] as const;
    for (const [text, fragment] of cited) {
      const rec = brain.solveFreeform(text);
      const compute = rec.stages.find((s) => s.id === "compute")!;
      expect(compute.details.join(" "), text).toContain(fragment);
    }
  });

  it("cites the constants the fly consulted", () => {
    const brain = new FlyBrain(trainNetwork(1337, 6).network);
    const rec = brain.solveFreeform("A 1000 kg satellite orbits Earth at 200 km. What is the force of gravity on it?");
    const compute = rec.stages.find((s) => s.id === "compute")!;
    expect(compute.details.join(" ")).toMatch(/Constants used:/);
  });
});
