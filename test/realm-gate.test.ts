/**
 * The heaven/hell feature is opt-in: the realms only fire when the human has
 * ticked the checkbox on the desk. Every trip out of the desk — a graded
 * verdict or a human's ruling on a freeform answer — runs through this gate,
 * so these guards pin its behavior.
 */
import { describe, it, expect } from "vitest";
import { verdictFlyState } from "../src/ui/sequencer";

describe("heaven/hell gate (opt-in)", () => {
  it("holds the fly at the desk while the checkbox is unticked", () => {
    expect(verdictFlyState({ freeform: false, happy: true, correct: true, realms: false })).toBe("celebrate");
    expect(verdictFlyState({ freeform: false, happy: false, correct: false, realms: false })).toBe("slump");
  });

  it("sends a graded answer to a realm once the checkbox is ticked", () => {
    expect(verdictFlyState({ freeform: false, happy: true, correct: true, realms: true })).toBe("heaven");
    expect(verdictFlyState({ freeform: false, happy: false, correct: false, realms: true })).toBe("hell");
  });

  it("never routes a keyless (freeform) answer to the realms", () => {
    // a question the fly was handed has no answer key — it only celebrates or
    // slumps until the human rules on it, whatever the checkbox says
    expect(verdictFlyState({ freeform: true, happy: true, correct: false, realms: true })).toBe("celebrate");
    expect(verdictFlyState({ freeform: true, happy: false, correct: true, realms: true })).toBe("slump");
  });
});
