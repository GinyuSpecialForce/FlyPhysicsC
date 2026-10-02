import { describe, it, expect } from "vitest";
import { trainNetwork } from "../src/core/train";
import { FlyBrain } from "../src/core/brain";
import { fmt } from "../src/core/format";

/**
 * Regression bank for the hard-phrasing probe: worded metric prefixes and
 * compound units, question-family routing (the answer must come back in the
 * family the question asks for), and the solver branches added for them
 * (spring force, friction force, equivalent resistance, electrical power,
 * charge flow, W = Vq, elastic collision, inductance, lever balance).
 * Values in scientific notation are asserted through fmt() so the test pins
 * the physics, not the superscript rendering.
 */
describe("hard phrasings (worded units + answer-family routing)", () => {
  const { network } = trainNetwork(1337, 6);

  it("parses worded metric prefixes and compound units into the right answers", () => {
    const brain = new FlyBrain(network);
    const cases: Array<[string, string]> = [
      // kilohm, centimeter, milliamp, microfarad
      ["A 12 kilohm resistor carries 2 amperes. What is the voltage?", "24000 V"],
      ["A 50 centimeter rope is pulled with 3 newtons. How much work is done?", "1.5 J"],
      ["A 3 milliamp current runs for 2 seconds. How much charge flows?", `${fmt(0.006)} C`],
      ["A 500 microfarad capacitor holds 12 volts. How much charge is stored?", "6000 μC"],
      // worded compound units
      ["A car travels 90 kilometers per hour for 2 hours. How far does it go?", `${fmt(180000)} m`],
      ["A wheel spins at 30 revolutions per minute. What is its angular velocity?", "3.14 rad/s"],
      // worded kinematics phrasings, including the to-rest sign
      [
        "A 1200 kilogram car slows from 25 meters per second to rest in 5 seconds. What is its acceleration?",
        "-5 m/s²",
      ],
      [
        "A 2 kilogram block starts from rest and is pushed 10 meters by a 20 newton force. What is its final speed?",
        "14.1 m/s", // √(2Fd/m) = √200
      ],
      [
        "A 5 kilogram block slides to a stop in 4 meters under 15 newtons of friction. What was its initial speed?",
        "4.9 m/s", // √(2Fd/m) = √24
      ],
      // equivalent resistance by phrasing
      ["Two 6 ohm resistors are in parallel. What is the equivalent resistance?", "3 Ω"],
      ["A 4 ohm and a 6 ohm resistor are in series. What is the equivalent resistance?", "10 Ω"],
    ];
    for (const [text, expected] of cases) {
      const rec = brain.solveFreeform(text);
      expect(rec.computedAnswer, text).toBe(expected);
    }
  });

  it("answers in the family the question asks for", () => {
    const brain = new FlyBrain(network);
    const cases: Array<[string, string]> = [
      // new solver branches
      [
        "A 3 kilogram ball moving at 4 meters per second hits a wall and bounces back at 4 meters per second. What is the change in momentum?",
        "24 kg·m/s",
      ],
      ["A 1500 kilogram car accelerates at 2 meters per second squared for 6 seconds. What is the net force?", "3000 N"],
      ["How much force is needed to accelerate a 1000 kilogram car at 3 meters per second squared?", "3000 N"],
      ["What is the kinetic energy of a 2 kilogram ball moving at 3 meters per second?", "9 J"],
      ["A 0.2 kilogram ball is thrown up at 10 meters per second. How high does it go?", "5.1 m"],
      ["A 60 kilogram person stands on Earth. What is their weight?", "588 N"], // W = mg
      [
        "A spring with a spring constant of 200 newtons per meter is compressed 0.3 meters. What is the force?",
        "60 N", // F = kx
      ],
      [
        "A 0.5 henry inductor sees a current change of 2 amperes in 0.1 seconds. What is the induced voltage?",
        "10 V", // V = L·ΔI/Δt
      ],
      [
        "A 5 microcoulomb charge sits 0.2 meters from a 2 microcoulomb charge. What is the force between them?",
        "2.25 N", // Coulomb
      ],
      ["A 20 volt battery is connected to a 5 ohm resistor. How much power is dissipated?", "80 W"], // V²/R
      ["A 100 watt bulb runs for 10 seconds. How much energy does it use?", "1000 J"], // E = P·t
      [
        "A 4 kilogram ball moving at 6 meters per second collides and sticks to a 2 kilogram ball at rest. What is their speed after?",
        "4 m/s",
      ],
      [
        "A 5 kilogram ball moving at 6 meters per second collides elastically with a 5 kilogram ball at rest. What is the speed of the first ball after?",
        "0 m/s", // equal masses: the first ball dead-stops
      ],
      ["What is the period of a 2 kilogram mass on a 500 newton per meter spring?", "0.397 s"], // 2π√(m/k)
      [
        "A 10 kilogram box sits on a rough floor with a coefficient of friction of 0.4. What force is needed to slide it?",
        "39.2 N", // F = μmg
      ],
      ["A 3 kilogram book is lifted 2 meters in 4 seconds. How much power is used?", "14.7 W"], // P = mgh/t
      ["A 12 volt car battery moves 600 coulombs. How much energy does it deliver?", "7200 J"], // W = Vq
      [
        "A 0.5 meter lever has a 200 newton load 0.1 meters from the pivot. What effort force balances it?",
        "40 N", // F₁d₁ = F₂d₂ with the effort arm at the lever's end
      ],
    ];
    for (const [text, expected] of cases) {
      const rec = brain.solveFreeform(text);
      expect(rec.computedAnswer, text).toBe(expected);
    }
  });

  it("solves uniform circular motion (sling problems)", () => {
    const brain = new FlyBrain(network);
    const cases: Array<[string, string]> = [
      // the exact multi-part phrasing from the wild
      [
        "David puts a 0.85 kg rock in his sling and twirls it at 3.0 Hz. The rock moves in a circle with radius 35.0 cm. Ignoring the effect of gravity determine: (a) the acceleration of the rock",
        "124 m/s²", // a = ω²r = (2πf)²r
      ],
      [
        "David puts a 0.85 kg rock in his sling and twirls it at 3.0 Hz. The rock moves in a circle with radius 35.0 cm. Ignoring the effect of gravity determine: (b) the tension in the sling",
        "106 N", // F = mω²r
      ],
      [
        "A 0.85 kg rock is twirled in a circle at 3.0 Hz with radius 35.0 cm. What is its speed?",
        "6.6 m/s", // v = ωr
      ],
      [
        "A rock is twirled in a circle at 3.0 Hz. What is the period of its motion?",
        "0.333 s", // T = 1/f
      ],
    ];
    for (const [text, expected] of cases) {
      const rec = brain.solveFreeform(text);
      expect(rec.computedAnswer, text).toBe(expected);
    }
  });

  it("refuses to guess when the problem is underdetermined", () => {
    const brain = new FlyBrain(network);
    // ε = N·A·ΔB/Δt — a field rate and turn count with no loop area
    const rec = brain.solveFreeform(
      "A 10 turn coil in a field changing at 0.5 teslas per second has what induced voltage?",
    );
    expect(rec.computedAnswer).toBeNull();
    expect(rec.stages.at(-1)!.summary).toContain("couldn't");
  });
});
