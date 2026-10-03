import { describe, expect, it } from "vitest";
import { normalizeMath, normalizeMathText } from "../src/core/normalize";
import { parseChoices, buildFreeformProblem } from "../src/core/freeform";
import { tokenize } from "../src/core/tokenizer";

/** The SI slots the tokenizer reads out of a line of text. */
function slots(text: string): string {
  return tokenize(text)
    .slots.map((s) => `${s.unit}:${s.value}`)
    .join(" ");
}

describe("math normalization (OCR damage)", () => {
  it("repairs scientific notation the way OCR writes it", () => {
    const cases: Array<[string, string]> = [
      ["The orbital speed is 6.75 x 10^8 m/s", "velocity:675000000"],
      ["The orbital speed is 6.75 X 10-8 m/s", "velocity:6.75e-8"],
      ["The orbital speed is 6.75 × 10⁻⁸ m/s", "velocity:6.75e-8"],
      ["The orbital speed is 6.75e8 m/s", "velocity:675000000"],
    ];
    for (const [text, expected] of cases) {
      expect(slots(normalizeMathText(text, { ocr: true })), text).toContain(expected);
    }
  });

  it("repairs misread digits inside numbers only", () => {
    expect(slots(normalizeMathText("A O.5 kg block", { ocr: true }))).toContain("mass:0.5");
    expect(slots(normalizeMathText("A l2 kg block", { ocr: true }))).toContain("mass:12");
    expect(slots(normalizeMathText("a 5.S kg mass", { ocr: true }))).toContain("mass:5.5");
    // a low-resolution 0 is the one Tesseract most often reads as "@"
    expect(slots(normalizeMathText("A 3.@ kg ball moves at 8.0 m/s", { ocr: true }))).toContain("mass:3");
    expect(slots(normalizeMathText("A 3.@ kg ball moves at 8.0 m/s", { ocr: true }))).toContain("velocity:8");
    // a word that merely contains a letter OCR confuses is left alone
    expect(normalizeMathText("A ball is thrown at 5 m/s", { ocr: true })).toContain("ball");
  });

  it("keeps thousands separators out of decimal points", () => {
    expect(slots(normalizeMathText("A mass of 1,200 kg", { ocr: true }))).toContain("mass:1200");
    expect(slots(normalizeMathText("A reading of 6,75 kg", { ocr: true }))).toContain("mass:6.75");
  });

  it("spells out the fractions the solver branches phrase as words", () => {
    expect(normalizeMathText("after 1/2 of the circle", { ocr: true })).toContain("half the circle");
    expect(normalizeMathText("after 1/4 of the revolution", { ocr: true })).toContain("one-quarter");
  });

  it("straightens the punctuation and Greek letters OCR emits", () => {
    expect(normalizeMathText("A mass of 5 kg − 2 kg")).toContain("5 kg - 2 kg");
    expect(normalizeMathText("the angular velocity ω = 3 rad/s")).toContain("omega");
    expect(normalizeMathText("at an angle θ of 30°")).toContain("theta");
  });

  it("repairs flattened unit exponents", () => {
    expect(slots(normalizeMathText("the acceleration is 9.8 m/s2"))).toContain("acceleration:9.8");
    expect(slots(normalizeMathText("a force of 20 N m"))).toContain("torque:20");
    expect(slots(normalizeMathText("a momentum of 3 kg m/s"))).toContain("momentum:3");
  });

  it("rejoins sentences the OCR engine split across lines", () => {
    const wrapped = "A 2.0 kg ball is thrown straight\nup at 20.0 m/s.\nWhat is its speed\nat the top?";
    expect(normalizeMathText(wrapped).replace(/\s+/g, " ")).toBe(
      "A 2.0 kg ball is thrown straight up at 20.0 m/s. What is its speed at the top?",
    );
    // …but blocks that start their own line stay on their own line, because
    // that is how multiple-choice options are laid out
    const page = "What is its kinetic energy?\n(A) 24 J\n(B) 96 J";
    expect(normalizeMathText(page).split("\n")).toHaveLength(3);
  });

  it("leaves typed text alone — no letter/digit guessing", () => {
    expect(normalizeMathText("A 5B pencil costs 5 dollars")).toBe("A 5B pencil costs 5 dollars");
    expect(normalizeMathText("μs = 0.90")).toContain("μs = 0.90"); // friction, not "mus"
  });

  it("reports which repairs fired so the UI can show its work", () => {
    const dirty = "A O.5 kg mass falls 5.S m at 1/2 of the circle";
    const { applied } = normalizeMath(dirty, { ocr: true });
    expect(applied).toContain("misread digits");
    expect(applied).toContain("fractions");
    const clean = normalizeMath("A 2 kg mass falls 5 m.", { ocr: true });
    expect(clean.applied).not.toContain("misread digits");
  });

  it("survives junk without throwing", () => {
    for (const junk of ["", "   ", "???!", "\n\n\n", "(A)"]) {
      expect(() => normalizeMath(junk, { ocr: true })).not.toThrow();
    }
  });
});

describe("multiple-choice pages", () => {
  it("pulls capital-lettered options off the stem", () => {
    const page = `A 3 kg ball moves at 8 m/s. What is its kinetic energy?
(A) 24 J
(B) 48 J
(C) 96 J
(D) 192 J`;
    const { stem, choices } = parseChoices(page);
    expect(stem).toBe("A 3 kg ball moves at 8 m/s. What is its kinetic energy?");
    expect(choices).toEqual(["24 J", "48 J", "96 J", "192 J"]);
  });

  it("splits options an OCR engine laid out on one line", () => {
    const page = "What is g on Mars?\n(A) 3.73 m/s^2 (B) 9.8 m/s^2\n(C) 24.8 m/s^2 (D) 1.62 m/s^2";
    const { stem, choices } = parseChoices(normalizeMathText(page, { ocr: true }));
    expect(stem).toBe("What is g on Mars?");
    expect(choices).toEqual(["3.73 m/s²", "9.8 m/s²", "24.8 m/s²", "1.62 m/s²"]);
  });

  it("does not mistake a homework problem's sub-parts for options", () => {
    const problem = `A race car of mass 1900 kg generates 15 kN of downforce at 75 m/s.
(a) Using μs = 0.90, determine the minimum radius turn.
(b) What is the centripetal force on the car?
(c) What is the minimum time for a U-turn?`;
    const { stem, choices } = parseChoices(problem);
    expect(choices).toEqual([]);
    expect(stem).toContain("(a) Using μs = 0.90");
    expect(stem).toContain("(c)");
  });

  it("needs three or more options before it believes them", () => {
    expect(parseChoices("The stem.\n(A) one\n(B) two").choices).toEqual([]);
    expect(parseChoices("The stem.\n(A) one\n(B) two\n(C) three").choices).toHaveLength(3);
  });

  it("attaches parsed options to the problem the brain runs", () => {
    const problem = buildFreeformProblem(
      "A 3 kg ball moves at 8 m/s. What is its kinetic energy?\n(A) 24 J\n(B) 96 J\n(C) 192 J\n(D) 48 J",
      { ocr: true },
    );
    expect(problem.choices).toHaveLength(4);
    expect(problem.text).not.toContain("(A)");
    expect(problem.answer).toBe(-1);
  });

  it("still refuses an empty page", () => {
    expect(() => buildFreeformProblem("   ")).toThrow();
  });
});
