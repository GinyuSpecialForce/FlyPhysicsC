import { describe, it, expect } from "vitest";
import { trainNetwork } from "../src/core/train";
import { FlyBrain } from "../src/core/brain";
import { FeedbackMemory } from "../src/core/feedback";
import { tokenize } from "../src/core/tokenizer";
import { buildFeatureVector, TOPIC_LIST } from "../src/core/features";

const CRATE = "A 5 kg crate is pulled with 40 N across a frictionless surface. What is its acceleration?";
const SLING =
  "David puts a 0.85 kg rock in his sling and twirls it at 3.0 Hz. The rock moves in a circle with radius 35.0 cm. Ignoring the effect of gravity determine: (a) the acceleration of the rock";

describe("feedback: the human tells the fly right/wrong and it learns", () => {
  it("remembers taught phrasings and recalls them for similar ones only", () => {
    const mem = new FeedbackMemory();
    expect(mem.lookup(CRATE)).toBeNull();
    mem.record(CRATE, "energy");
    expect(mem.lookup(CRATE)).toBe("energy");
    // near-identical phrasing recalls the same topic…
    expect(mem.lookup("A 5 kg crate is pulled with 40 N across a frictionless surface. What is its acceleration")).toBe("energy");
    // …an unrelated problem doesn't
    expect(mem.lookup("Two 6 ohm resistors are in parallel. What is the equivalent resistance?")).toBeNull();
  });

  it("learn() recalls the taught topic at classification time and shifts the network", () => {
    const { network } = trainNetwork(1337, 6);
    const brain = new FlyBrain(network);
    const { slots, keywordHits } = tokenize(CRATE);
    const input = buildFeatureVector(slots, keywordHits);
    const energyIdx = TOPIC_LIST.indexOf("energy");
    const pBefore = network.forward(input).probs[energyIdx];

    brain.learn(CRATE, "energy", 0.5);

    // the SGD step moved the mushroom-body network
    expect(network.forward(input).probs[energyIdx]).toBeGreaterThan(pBefore);
    // and the episodic recall now owns this phrasing
    const rec = brain.solveFreeform(CRATE);
    expect(rec.predicted).toBe("energy");
    expect(rec.stages.find((s) => s.id === "classify")!.summary).toContain("Recalled");
  });

  it("taught topics still can't answer in the wrong family — the answer-family check stands", () => {
    const { network } = trainNetwork(1337, 6);
    const brain = new FlyBrain(network);
    // teach a lie: the sling problem is NOT momentum
    brain.learn(SLING, "momentum", 0.5);
    const rec = brain.solveFreeform(SLING);
    expect(rec.predicted).toBe("momentum"); // classification obeys the human
    // but momentum can't produce m/s², so the answer still comes out right
    expect(rec.computedAnswer).toBe("124 m/s²");
  });

  it("learning survives new brain instances (the desk re-creates brains constantly)", () => {
    const { network } = trainNetwork(1337, 6);
    const mem = new FeedbackMemory();
    const taught = new FlyBrain(network, { type: "none" }, null, mem);
    taught.learn(SLING, "kinematics", 0.5);
    const fresh = new FlyBrain(network, { type: "none" }, null, mem);
    const rec = fresh.solveFreeform(SLING);
    expect(rec.predicted).toBe("kinematics");
    expect(rec.computedAnswer).toBe("124 m/s²");
    expect(mem.size).toBe(1);
  });
});
