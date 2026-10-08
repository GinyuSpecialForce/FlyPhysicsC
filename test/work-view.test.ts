import { describe, expect, it } from "vitest";
import { renderWork } from "../src/ui/workView";
import { TOPIC_LIST } from "../src/core/features";
import type { Slot, Topic } from "../src/core/features";
import type { Problem, StageTrace, ThoughtRecord } from "../src/core/types";

/** A record with sensible defaults, so each test states only what it cares about. */
function makeRecord(over: Partial<ThoughtRecord> = {}): ThoughtRecord {
  const topicProbs = Object.fromEntries(TOPIC_LIST.map((t) => [t, 0])) as Record<Topic, number>;
  const problem: Problem = {
    id: "p1",
    topic: "newton",
    text: "A 2 kg crate is pulled with 40 N across a frictionless surface. What is its acceleration?",
    choices: [{ text: "20 m/s²" }, { text: "10 m/s²" }, { text: "5 m/s²" }],
    answer: 0,
    origin: "eval",
  };
  const stages: StageTrace[] = [
    {
      id: "encode",
      label: "Encoding",
      region: "Optic lobe",
      summary: "2 quantities, 1 keyword hits",
      details: ["2 kg → mass", "40 N → force"],
      activation: 0.6,
    },
    {
      id: "answer",
      label: "Answering",
      region: "Legs + pencil",
      summary: "Choice A — correct",
      details: ["Wing buzz + happy leg wiggle"],
      activation: 0.9,
    },
  ];
  topicProbs.newton = 0.82;
  topicProbs.energy = 0.09;
  return {
    problem,
    slots: [
      { text: "2 kg", unit: "mass", value: 2 },
      { text: "40 N", unit: "force", value: 40 },
    ],
    keywordHits: [3, 11],
    topicProbs,
    predicted: "newton",
    correctTopic: "newton",
    confidence: 0.82,
    circuit: "newton",
    answerIndex: 0,
    correct: true,
    computedAnswer: "20 m/s²",
    computedSymbolic: null,
    stages,
    ...over,
  };
}

const slot = (text: string, unit: string, value: number): Slot => ({ text, unit, value });

describe("renderWork — the answer", () => {
  it("leads with the fly's own answer-stage summary", () => {
    expect(renderWork(makeRecord())).toContain("Choice A — correct");
  });

  it("marks a correct answer good and a wrong one bad", () => {
    expect(renderWork(makeRecord())).toContain("work-head good");
    const wrong = makeRecord({ correct: false, answerIndex: 1 });
    const html = renderWork(wrong);
    expect(html).toContain("work-head bad");
    expect(html).toContain("Choice A — correct"); // the stage summary still says so
  });

  it("does not repeat a number the summary already ends in", () => {
    const rec = makeRecord({
      computedAnswer: "10.7 N",
      computedSymbolic: "mv²/r",
      stages: [
        {
          id: "answer",
          label: "Answering",
          region: "Legs + pencil",
          summary: "Answer: mv²/r — 10.7 N for the given values",
          details: [],
          activation: 0.9,
        },
      ],
    });
    const html = renderWork(rec);
    expect(html).toContain("Answer: mv²/r — 10.7 N for the given values");
    // the headline already says the number; a subline would just echo it
    expect(html).not.toContain("work-answer-sub");
  });

  it("surfaces the computed value when the summary does not already give it", () => {
    // a bare multiple choice verdict hides the quantity it actually computed
    const html = renderWork(makeRecord({ computedAnswer: "20 m/s²" }));
    expect(html).toContain("Choice A — correct");
    expect(html).toContain('<div class="work-answer-sub">20 m/s²</div>');
  });

  it("does not claim correctness on a question the fly was handed", () => {
    // a user problem has no key, so "good" would be a verdict nobody earned
    const rec = makeRecord({
      problem: { ...makeRecord().problem, answer: -1, origin: "user" },
      answerIndex: -1,
      correct: false,
      computedAnswer: "20 m/s²",
      stages: [
        {
          id: "answer",
          label: "Answering",
          region: "Legs + pencil",
          summary: "Answer: 20 m/s²",
          details: [],
          activation: 0.9,
        },
      ],
    });
    const html = renderWork(rec);
    expect(html).toContain("work-head good"); // it did solve it
    expect(html).not.toContain("← correct"); // but nothing was "right"
    expect(html).not.toContain("but it belongs under");
  });

  it("fails clearly when the fly could not solve the question", () => {
    const rec = makeRecord({
      problem: { ...makeRecord().problem, answer: -1, origin: "user" },
      answerIndex: -1,
      correct: false,
      computedAnswer: null,
      stages: [
        {
          id: "answer",
          label: "Answering",
          region: "Legs + pencil",
          summary: "The fly couldn't quite solve this one",
          details: [],
          activation: 0.3,
        },
      ],
    });
    const html = renderWork(rec);
    expect(html).toContain("work-head bad");
    expect(html).toContain("The fly couldn't quite solve this one");
  });
});

describe("renderWork — what it read", () => {
  it("lists every quantity with the family it was read as and its SI value", () => {
    const rec = makeRecord({
      slots: [slot("2 kg", "mass", 2), slot("40 N", "force", 40), slot("500 g", "mass", 0.5)],
    });
    const html = renderWork(rec);
    for (const [text, family, value] of [
      ["2 kg", "mass", "2"],
      ["40 N", "force", "40"],
      ["500 g", "mass", "0.5"],
    ]) {
      expect(html).toContain(text);
      expect(html).toContain(family);
      expect(html).toContain(value);
    }
    expect(html.match(/<tr>/g)).toHaveLength(4); // header row + three quantities
  });

  it("says so when the phrasing contained no quantities", () => {
    const html = renderWork(makeRecord({ slots: [], keywordHits: [], stages: [] }));
    expect(html).toContain("No quantities were found");
    expect(html).not.toContain("SI value");
    expect(html).not.toContain("keyword hit");
  });

  it("reports the source, confidence, flags and repairs of a photographed page", () => {
    const rec = makeRecord({
      source: {
        kind: "image",
        fileName: "problem-4.png",
        confidence: 0.88,
        transcript: "A 2 kg crate is pulled with 4O N…",
        flags: ["4O N"],
        repairs: ["O → 0"],
      },
    });
    const html = renderWork(rec);
    expect(html).toContain("problem-4.png");
    expect(html).toContain("88%");
    expect(html).toContain("4O N");
    expect(html).toContain("Check these numbers: 4O N");
    expect(html).toContain("Repaired while normalizing: O → 0");
  });

  it("omits the source section entirely for a typed question", () => {
    const html = renderWork(makeRecord());
    expect(html).not.toContain("How the question arrived");
  });
});

describe("renderWork — classification", () => {
  it("shows the classifier's full distribution, not just the winner", () => {
    const html = renderWork(makeRecord());
    for (const t of TOPIC_LIST) expect(html).toContain(t);
    expect(html.match(/class="topic-row"/g)).toHaveLength(TOPIC_LIST.length);
    expect(html).toContain('style="width:82%"'); // the bar is the real probability
    expect(html).toContain("<span class=\"topic-pct\">82%</span>");
  });

  it("marks the predicted circuit and says which one actually ran", () => {
    const html = renderWork(makeRecord({ circuit: "energy", predicted: "newton" }));
    expect(html).toContain("← predicted");
    expect(html).toContain("Routed to the <b>energy</b> motor circuit at 82% confidence");
  });

  it("gives every bar a visible fill, not just the predicted one", () => {
    // a bar div with no tone class inherits no background, so the whole
    // distribution would read as empty
    const fills = [...renderWork(makeRecord()).matchAll(/<div class="([^"]*)" style="width:\d+%"><\/div>/g)].map(
      (m) => m[1],
    );
    expect(fills).toHaveLength(TOPIC_LIST.length);
    expect(fills.every((c) => c !== "")).toBe(true);
  });

  it("does not paint an ungraded pick as a wrong one", () => {
    const rec = makeRecord({
      problem: { ...makeRecord().problem, answer: -1, origin: "user" },
    });
    const html = renderWork(rec);
    // "warn" reads as "this classification was wrong", which nobody can know
    // about a question the fly was handed
    expect(html).not.toContain('class="warn"');
    expect(html).toContain("← predicted"); // still marked, just neutrally
  });

  it("calls out a misclassification rather than hiding it", () => {
    const rec = makeRecord({ predicted: "energy", correctTopic: "newton" });
    const html = renderWork(rec);
    expect(html).toContain("Classified as <b>energy</b>, but it belongs under <b>newton</b>");
    // the true topic is marked too, so the reader can see what it should have said
    expect(html).toContain("← correct");
  });

  it("does not adjudicate the topic on a question with no key", () => {
    const rec = makeRecord({
      problem: { ...makeRecord().problem, answer: -1, origin: "user" },
    });
    const html = renderWork(rec);
    expect(html).not.toContain("but it belongs under");
    expect(html).not.toContain("← correct");
  });
});

describe("renderWork — the trace", () => {
  it("prints every stage summary and every detail line, in order", () => {
    const rec = makeRecord({
      stages: [
        {
          id: "encode",
          label: "Encoding",
          region: "Optic lobe",
          summary: "2 quantities",
          details: ["2 kg → mass", "40 N → force"],
          activation: 0.6,
        },
        {
          id: "route",
          label: "Routing",
          region: "Central complex",
          summary: "Engage the newton solver",
          details: ['Confidence 82% → motor program "solve newton"'],
          activation: 0.9,
        },
      ],
    });
    const html = renderWork(rec);
    expect(html).toContain("Encoding");
    expect(html).toContain("Optic lobe");
    expect(html).toContain("2 quantities");
    expect(html).toContain("2 kg → mass");
    expect(html).toContain("40 N → force");
    expect(html).toContain("Routing");
    expect(html).toContain("Engage the newton solver");
    expect(html).toContain("Central complex");
    // stages keep pipeline order, numbered from one
    expect(html.indexOf("Encoding")).toBeLessThan(html.indexOf("Routing"));
    expect(html).toContain('<span class="work-step-num">1</span>');
    expect(html).toContain('<span class="work-step-num">2</span>');
  });

  it("survives a record with no stages at all", () => {
    expect(() => renderWork(makeRecord({ stages: [] }))).not.toThrow();
    expect(renderWork(makeRecord({ stages: [] }))).toContain("No answer.");
  });
});

describe("renderWork — untrusted text", () => {
  it("escapes text that came from a photographed or typed question", () => {
    const rec = makeRecord({
      problem: { ...makeRecord().problem, text: "<img src=x onerror=alert(1)>" },
      slots: [slot("<b>2 kg</b>", "mass", 2)],
      computedAnswer: "<script>alert(2)</script>",
      stages: [
        {
          id: "compute",
          label: "Computing",
          region: "Motor circuits",
          summary: "<script>alert(3)</script>",
          details: ["<iframe src=evil>"],
          activation: 0.8,
        },
      ],
      source: {
        kind: "image",
        fileName: "<b>shot.png</b>",
        confidence: 0.5,
        transcript: "<script>alert(4)</script>",
        flags: ["<script>alert(5)</script>"],
        repairs: [],
      },
    });
    const html = renderWork(rec);
    expect(html).not.toMatch(/<script>|onerror=|<iframe|<img src=x/);
    expect(html).toContain("&lt;script&gt;alert(4)&lt;/script&gt;");
    expect(html).toContain("&lt;b&gt;shot.png&lt;/b&gt;");
    expect(html).toContain("&lt;b&gt;2 kg&lt;/b&gt;");
  });
});