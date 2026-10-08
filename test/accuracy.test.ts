import { describe, it, expect } from "vitest";
import { trainNetwork, evaluate } from "../src/core/train";
import { EVAL_BANK } from "../src/core/eval-bank";
import { generateProblem } from "../src/core/bank";
import { TOPIC_LIST } from "../src/core/features";
import { Rng } from "../src/core/rng";
import { FlyBrain } from "../src/core/brain";
import { makeBrain, LESIONS } from "../src/core/lesions";
import type { Topic } from "../src/core/features";

describe("round-trip: generators → tokenizer → circuits", () => {
  it("each topic's solver recovers the generator's answer on synthetic problems", () => {
    const rng = new Rng(42);
    const { network } = trainNetwork(1337, 3);
    const brain = new FlyBrain(network);
    const perTopic: Record<string, { ok: number; total: number }> = {};
    const failures: string[] = [];

    for (const topic of TOPIC_LIST) {
      perTopic[topic] = { ok: 0, total: 0 };
      for (let i = 0; i < 40; i++) {
        const problem = generateProblem(topic, rng);
        const rec = brain.solve(problem);
        perTopic[topic].total++;
        if (rec.correct) perTopic[topic].ok++;
        else
          failures.push(
            `[${topic}] "${problem.text}" → predicted ${rec.predicted}, circuit ${rec.circuit}, chose ${rec.answerIndex >= 0 ? problem.choices[rec.answerIndex].text : "none"}, expected "${problem.choices[problem.answer].text}"`,
          );
      }
    }
    if (failures.length) console.log(failures.slice(0, 30).join("\n"));
    for (const topic of TOPIC_LIST) {
      const { ok, total } = perTopic[topic];
      expect(ok / total, `${topic}: ${ok}/${total}`).toBeGreaterThanOrEqual(0.9);
    }
  });
});

describe("eval accuracy gate", () => {
  const { network, evalAccuracies } = trainNetwork(1337, 6);
  const result = evaluate(network);

  it("reports per-topic accuracy", () => {
    const lines = TOPIC_LIST.map((t: Topic) => {
      const p = result.perTopic[t];
      return `${t}: ${p.correct}/${p.total}`;
    });
    console.log(`epoch accuracies: ${evalAccuracies.map((a) => (a * 100).toFixed(0)).join(", ")}`);
    console.log(`FINAL: ${result.correct}/${result.total} = ${(result.accuracy * 100).toFixed(1)}%`);
    console.log(lines.join("\n"));
    const missed = result.records
      .filter((r) => !r.correct)
      .map(
        (r) =>
          `[${r.correctTopic}] "${r.problem.text}" → classified ${r.predicted} (${(r.confidence * 100).toFixed(0)}%), circuit ${r.circuit}, chose ${r.answerIndex >= 0 ? r.problem.choices[r.answerIndex].text : "none"}, expected "${r.problem.choices[r.problem.answer].text}"`,
      );
    if (missed.length) console.log(`MISSED (${missed.length}):\n${missed.join("\n")}`);
    expect(true).toBe(true);
  });

  it("beats chance by a wide margin", () => {
    expect(result.accuracy).toBeGreaterThan(0.4);
  });

  it("meets the ≥85% accuracy gate", () => {
    expect(result.accuracy).toBeGreaterThanOrEqual(0.85);
  });

  it("classifies topics well above chance", () => {
    const classOk = result.records.filter((r) => r.predicted === r.correctTopic).length;
    expect(classOk / result.total).toBeGreaterThan(0.6);
  });
});

describe("tokenizer", () => {
  it("parses compound units longest-first", async () => {
    const { tokenize } = await import("../src/core/tokenizer");
    const { slots } = tokenize("A 4 kg block moving at 3 m/s accelerates at 2 m/s² for 5 s");
    const units = slots.map((s) => s.unit);
    expect(units).toContain("mass");
    expect(units).toContain("velocity");
    expect(units).toContain("acceleration");
    expect(units).toContain("time");
  });

  it("converts to SI", async () => {
    const { tokenize } = await import("../src/core/tokenizer");
    const { slots } = tokenize("a 500 g mass and 2.5 cm and 30°");
    expect(slots.find((s) => s.unit === "mass")?.value).toBeCloseTo(0.5);
    expect(slots.find((s) => s.unit === "length")?.value).toBeCloseTo(0.025);
    expect(slots.find((s) => s.unit === "angle")?.value).toBeCloseTo(Math.PI / 6);
  });

  it("pre-extracts structured values", async () => {
    const { tokenize } = await import("../src/core/tokenizer");
    const { slots } = tokenize("k = 300 N/m spring and μ = 0.2 and 100-turn coil");
    expect(slots.find((s) => s.unit === "spring-k")?.value).toBe(300);
    expect(slots.find((s) => s.unit === "mu-coeff")?.value).toBe(0.2);
    expect(slots.find((s) => s.unit === "turns")?.value).toBe(100);
  });
});

describe("lesions degrade accuracy", () => {
  const { network } = trainNetwork(1337, 6);
  const intact = evaluate(network).accuracy;

  it("mushroom-body and motor lesions hurt a lot", () => {
    const mb = evaluate(network, { type: "mushroom-bodies" }).accuracy;
    const motor = evaluate(network, { type: "motor" }).accuracy;
    expect(mb).toBeLessThan(intact);
    expect(motor).toBe(0);
  });

  it("central-complex lesion scrambles routing even without an explicit rng", () => {
    // regression: the desk used to build FlyBrain(network, lesion) with no
    // rng, which silently left the central complex intact (60/60 with the
    // lesion "applied"). FlyBrain must self-seed and actually randomize.
    const brain = new FlyBrain(network, { type: "central-complex" });
    const records = EVAL_BANK.slice(0, 12).map((p) => brain.solve(p));
    const flagged = records.filter((r) => r.stages.some((s) => s.id === "route" && s.summary.includes("Lesioned")));
    expect(flagged.length).toBe(12);
    // with 12 random routings, exact classification of every topic is unlikely
    const routedToTruth = records.filter((r) => r.circuit === r.correctTopic).length;
    expect(routedToTruth).toBeLessThanOrEqual(11);
    expect(evaluate(network, { type: "central-complex" }).accuracy).toBeLessThan(intact);
  });

  it("makeBrain applies every registry lesion and each one degrades the bank", () => {
    for (const info of LESIONS) {
      const brain = makeBrain(network, { type: info.type });
      const correct = EVAL_BANK.map((p) => brain.solve(p)).filter((r) => r.correct).length;
      if (info.type === "none") {
        expect(correct).toBe(EVAL_BANK.length);
      } else {
        expect(correct, `${info.label} should degrade accuracy`).toBeLessThan(EVAL_BANK.length);
      }
    }
  });
});
