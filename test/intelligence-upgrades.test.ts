/**
 * Comprehensive tests for the 10 FlyBrain intelligence upgrades:
 *   #1 Multi-hop dimensional chaining (rescueMultiHop)
 *   #2 AP Physics C Calculus engine (symbolic d/dt, d/dx & definite integrals)
 *   #3 Proportional & Scaling reasoning ("doubles", "triples", "halved")
 *   #4 Role-aware semantic slot disambiguation (initial/final/radius/height/diameter)
 *   #5 Implicit zero boundary conditions ("from rest", "comes to a stop", "stationary")
 *   #6 2D Vector decomposition & superposition (east/north/west/south, +x/-y)
 *   #7 Multi-part stateful context ((a) → (b) working memory)
 *   #8 Choice-guided unit inference (choiceUnits)
 *   #9 Relational bigram priors (keywordPriors disambiguating overlapping vocabulary)
 *   #10 Hive hard-negative interleaving in trainNetwork
 */
import { describe, it, expect } from "vitest";
import { trainNetwork } from "../src/core/train";
import { FlyBrain, choiceUnits } from "../src/core/brain";
import { tokenize, extractImplicitSlots } from "../src/core/tokenizer";
import { takeRole, radiusOf } from "../src/core/extract";
import { keywordPriors } from "../src/core/priors";
import { TOPIC_LIST, buildFeatureVector } from "../src/core/features";
import { makeEntry } from "../src/core/corpus";

describe("10 intelligence upgrades", () => {
  const { network } = trainNetwork(1337, 6);

  it("#1 Multi-hop forward chaining: solves 2-step equations when no single equation bridges givens to target", () => {
    const brain = new FlyBrain(network);
    // Given V = 12 V, R = 6 Ω, t = 10 s, ask for total energy (W = P·t via P = V²/R or I = V/R → P = IV)
    // P = 12² / 6 = 24 W, E = 24 W * 10 s = 240 J
    const rec = brain.solveFreeform(
      "A 12 V battery is connected across a 6 Ω resistor for 10 s. How much energy is dissipated?",
    );
    expect(rec.computedAnswer).toBe("240 J");
    const computeDetails = rec.stages.find((s) => s.id === "compute")!.details.join(" ");
    expect(computeDetails).toContain("Step 1");
    expect(computeDetails).toContain("Step 2");
  });

  it("#2 AP Physics C Calculus engine: symbolic differentiation and definite integration", () => {
    const brain = new FlyBrain(network);

    // x(t) = 3t^2 - 2t + 5 → v(t) = 6t - 2 → at t = 2 s, v = 10 m/s
    const posVel = brain.solveFreeform(
      "A particle moves along the x-axis with position x(t) = 3t² - 2t + 5 meters. What is its velocity at t = 2 s?",
    );
    expect(posVel.computedAnswer).toBe("10 m/s");

    // x(t) = 2t^3 - 4t^2 → a(t) = 12t - 8 → at t = 3 s, a = 28 m/s²
    const posAcc = brain.solveFreeform(
      "The position of an object is given by x(t) = 2t³ - 4t² meters. What is its acceleration at t = 3 s?",
    );
    expect(posAcc.computedAnswer).toBe("28 m/s²");

    // F(t) = 6t^2 → J = ∫_0^2 6t² dt = [2t³]_0^2 = 16 kg·m/s
    const impulse = brain.solveFreeform(
      "A time-varying force F(t) = 6t² N acts on a particle from t = 0 s to t = 2 s. What is the impulse delivered?",
    );
    expect(impulse.computedAnswer).toBe("16 kg·m/s");

    // F(x) = 4x + 2 → W = ∫_0^3 (4x + 2) dx = [2x² + 2x]_0^3 = 18 + 6 = 24 J
    const work = brain.solveFreeform(
      "A variable force F(x) = 4x + 2 N pushes a block from x = 0 m to x = 3 m. How much work is done?",
    );
    expect(work.computedAnswer).toBe("24 J");

    // q(t) = 4t^2 + 3t → I(t) = 8t + 3 → at t = 2 s, I = 19 A
    const current = brain.solveFreeform(
      "The charge through a wire is q(t) = 4t² + 3t coulombs. What is the current at t = 2 s?",
    );
    expect(current.computedAnswer).toBe("19 A");

    // U(x) = 3x^2 - 12x → F(x) = -dU/dx = -(6x - 12) → at x = 4 m, F = -12 N
    const potForce = brain.solveFreeform(
      "A particle has potential energy U(x) = 3x² - 12x J. What is the magnitude of the force at x = 4 m?",
    );
    expect(potForce.computedAnswer).toBe("12 N");
  });

  it("#3 Proportional & Scaling reasoning: handles 'doubles', 'triples', 'halved'", () => {
    const brain = new FlyBrain(network);

    // K = 50 J, speed triples → K' = 50 * 3² = 450 J
    const ke = brain.solveFreeform(
      "A moving cart has a kinetic energy of 50 J. If its speed is tripled, what is its new kinetic energy?",
    );
    expect(ke.computedAnswer).toBe("450 J");

    // F = 36 N, distance triples → F' = 36 / 9 = 4 N
    const coulomb = brain.solveFreeform(
      "Two charges exert an electrostatic force of 36 N on each other. If the distance between them is tripled, what is the new electrostatic force?",
    );
    expect(coulomb.computedAnswer).toBe("4 N");
  });

  it("#4 & #5 Role-aware slot tagging and implicit zero boundary conditions", () => {
    const { slots } = tokenize(
      "A car initially moving at 12 m/s accelerates to 28 m/s around a circular track of diameter 40 m after falling from a cliff 15 m high.",
    );
    expect(takeRole(slots, "velocity", "initial")).toBe(12);
    expect(takeRole(slots, "velocity", "final")).toBe(28);
    expect(takeRole(slots, "length", "diameter")).toBe(40);
    expect(takeRole(slots, "length", "height")).toBe(15);
    expect(radiusOf(slots, "circular track of diameter 40 m")).toBe(20);

    // Implicit zero extraction ("from rest", "comes to a stop")
    const restText = "A 5 kg block starts from rest and is pulled until it comes to a stop.";
    const { slots: explicit } = tokenize(restText);
    const implicit = extractImplicitSlots(restText, explicit);
    expect(implicit.some((s) => s.role === "initial" && s.value === 0)).toBe(true);
    expect(implicit.some((s) => s.role === "final" && s.value === 0)).toBe(true);
  });

  it("#6 2D Vector decomposition & superposition: orthogonal forces, 2D collisions, displacements", () => {
    const brain = new FlyBrain(network);

    // 6 N east + 8 N north on a 2 kg mass → F_net = 10 N, a = 5 m/s²
    const force2d = brain.solveFreeform(
      "Two forces act on a 2 kg puck: 6 N east and 8 N north. What is the magnitude of its acceleration?",
    );
    expect(force2d.computedAnswer).toBe("5 m/s²");

    // 30 m east + 40 m north → 50 m displacement
    const disp2d = brain.solveFreeform(
      "A hiker walks 30 m east and then 40 m north. What is the magnitude of the resultant displacement?",
    );
    expect(disp2d.computedAnswer).toBe("50 m");

    // 2D inelastic collision: 2 kg at 3 m/s east + 2 kg at 4 m/s north → |p| = 10 kg·m/s → v_f = 2.5 m/s
    const coll2d = brain.solveFreeform(
      "A 2 kg clay ball moving at 3 m/s east collides and sticks to a 2 kg clay ball moving at 4 m/s north. What is their speed after the collision?",
    );
    expect(coll2d.computedAnswer).toBe("2.5 m/s");
  });

  it("#7 Multi-part stateful context: part (b) inherits parameters and answers from part (a)", () => {
    const brain = new FlyBrain(network);
    brain.clearContext();

    // Part (a) establishes m = 4 kg and F = 20 N → a = 5 m/s²
    const partA = brain.solveFreeform(
      "(a) A 4 kg block is pushed with a net force of 20 N across a frictionless floor. What is its acceleration?",
    );
    expect(partA.computedAnswer).toBe("5 m/s²");

    // Part (b) only mentions t = 6 s and asks for speed (inherits a = 5 m/s² or m = 4 kg, F = 20 N)
    const partB = brain.solveFreeform(
      "(b) Using the same block, if the force acts for 6 s from rest, what speed does it reach?",
    );
    expect(partB.computedAnswer).toBe("30 m/s");
    const details = partB.stages.find((s) => s.id === "compute")!.details.join(" ");
    expect(details).toContain("Working memory");
  });

  it("#8 Choice-guided unit inference: infers target unit from multiple-choice options when prose is terse", () => {
    const inferred = choiceUnits([
      { text: "12 W" },
      { text: "24 W" },
      { text: "36 W" },
      { text: "48 W" },
    ]);
    expect(inferred).toEqual(["W"]);

    const brain = new FlyBrain(network);
    // Prose says "What is the output of the resistor?" without naming "power" or "watts",
    // but the choices are all in Watts (W).
    const rec = brain.solve({
      id: "choice-unit-test",
      topic: "circuits",
      origin: "eval",
      text: "A 12 V source is connected across a 6 Ω resistor. What is the output of the resistor?",
      choices: [
        { text: "2 W" },
        { text: "18 W" },
        { text: "24 W" },
        { text: "72 W" },
      ],
      answer: 2,
      solution: "P = V²/R = 144/6 = 24 W",
    });
    expect(rec.correct).toBe(true);
    expect(rec.answerIndex).toBe(2);
  });

  it("#9 Relational bigram priors: disambiguates overlapping keywords (e.g., 'magnetic flux' vs 'electric field')", () => {
    const indPriors = keywordPriors(
      "A loop of wire experiences a changing magnetic flux and an induced current.",
      TOPIC_LIST,
    );
    const indIdx = TOPIC_LIST.indexOf("induction");
    const magIdx = TOPIC_LIST.indexOf("magnetism");
    expect(indPriors[indIdx]).toBeGreaterThan(indPriors[magIdx]);

    const rotPriors = keywordPriors(
      "A solid cylinder rolls without slipping down an incline. What is its rotational kinetic energy?",
      TOPIC_LIST,
    );
    const rotIdx = TOPIC_LIST.indexOf("rotation");
    const engIdx = TOPIC_LIST.indexOf("energy");
    expect(rotPriors[rotIdx]).toBeGreaterThan(rotPriors[engIdx]);
  });

  it("#10 Hive hard-negative interleaving: trainNetwork upweights human-taught corrections during epochs", () => {
    const customPhrase = "An eldritch chronotron pulses with 15 A through a 4 Ω coil.";
    const entry = makeEntry(customPhrase, "induction", "taught", "test-install");
    const { network: hiveNet } = trainNetwork(1337, 3, 120, { hiveEntries: [entry] });
    const { slots, keywordHits } = tokenize(customPhrase);
    const probs = hiveNet.forward(buildFeatureVector(slots, keywordHits)).probs;
    const indProb = probs[TOPIC_LIST.indexOf("induction")];
    // With 2x hard-negative interleaving per epoch, the network strongly favors the taught topic
    expect(indProb).toBeGreaterThan(0.25);
  });
});
