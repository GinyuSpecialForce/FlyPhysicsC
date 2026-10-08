/**
 * The brain: full pipeline from problem text → answer. The network classifies
 * (mushroom bodies), routing picks a circuit (central complex), the circuit
 * computes (motor systems). Every step records a trace for the 3D scene.
 */
import { tokenize, familyForUnit } from "./tokenizer";
import { buildFeatureVector, TOPIC_LIST } from "./features";
import { blendPriors, keywordPriors } from "./priors";
import type { Topic } from "./features";
import { Network } from "./network";
import { topicModule } from "./topics/index";
import type { SolveResult } from "./topics/index";
import { constantAnswer } from "./constant-answers";
import { textbookAnswer } from "./textbook";
import { suppliedConstants } from "./constant-table";
import { citeEquation, equationForConcept, rescueSolve } from "./dimension-solver";
import type { Citation, RescueResult } from "./dimension-solver";
import { canonical, materialize, parseChoiceExpression, symbolsOf } from "./symbolic";
import type { Sym } from "./symbolic";
import { tokenizeVars } from "./tokenizer";
import type { UnitFamily } from "./units";
import { STAGES } from "./stages";
import { fmt, parseChoiceNumber } from "./format";
import type { Problem, ThoughtRecord, StageTrace } from "./types";
import type { Lesion } from "./lesions";
import { Rng } from "./rng";
import { buildFreeformProblem, FREEFORM_PROBLEM } from "./freeform";
import { FeedbackMemory } from "./feedback";
export class FlyBrain {
  network: Network;
  lesion: Lesion;
  lesionRng: Rng | null;
  /** Human feedback: phrasings the user taught, shared across desk brains. */
  feedback: FeedbackMemory;
  /** How the latest freeform text arrived — set when a picture was read. */
  private lastSource: ThoughtRecord["source"] = undefined;
  /** Most recent freeform answer — solve(FREEFORM_PROBLEM) re-returns it. */
  private lastRecord: ThoughtRecord | null = null;

  constructor(
    network: Network,
    lesion: Lesion = { type: "none" },
    lesionRng: Rng | null = null,
    feedback: FeedbackMemory = new FeedbackMemory(),
  ) {
    this.network = network;
    this.lesion = lesion;
    this.feedback = feedback;
    // central-complex routing is random; give it a seeded rng if the caller
    // didn't, so the lesion never silently does nothing
    this.lesionRng = lesion.type === "central-complex" ? (lesionRng ?? new Rng(7)) : null;
  }

  /**
   * Teach the fly: this phrasing is a `topic` problem. Writes to the episodic
   * feedback memory AND takes an SGD step on the mushroom-body network,
   * so similar phrasings the user never showed route the same way. Pass a
   * negative-ish picture by teaching the topic it SHOULD have been.
   */
  learn(text: string, topic: Topic, strength = 0.25): void {
    this.feedback.record(text, topic);
    const { slots, keywordHits } = tokenize(text);
    const input = buildFeatureVector(slots, keywordHits);
    this.network.trainStep(input, TOPIC_LIST.indexOf(topic), strength);
  }

  /**
   * Run the full pipeline on a free-form question with no answer key: the
   * fly classifies it, routes, computes, and states its answer. Persists
   * until the next freeform question so re-rendering the desk is idempotent.
   *
   * `opts.ocr` additionally repairs the letter/digit confusions an OCR engine
   * makes in a photographed problem.
   */
  solveFreeform(
    text: string,
    opts: { ocr?: boolean; source?: ThoughtRecord["source"] } = {},
  ): ThoughtRecord {
    this.lastSource = opts.source;
    this.lastRecord = this.run(buildFreeformProblem(text, opts));
    if (this.lastSource) this.lastRecord.source = this.lastSource;
    return this.lastRecord;
  }

  /** The last freeform answer, or null before the first one. */
  get freeformRecord(): ThoughtRecord | null {
    return this.lastRecord;
  }

  /** Run the full pipeline on a problem. */
  solve(problem: Problem): ThoughtRecord {
    if (problem === FREEFORM_PROBLEM) return this.lastRecord!;
    return this.run(problem);
  }

  private run(problem: Problem): ThoughtRecord {
    const traces: StageTrace[] = [];
    const lesioned = this.lesion.type !== "none";

    // ── Stage 1: encode (optic lobe) ──────────────────────────────────
    const { slots, keywordHits } = tokenize(problem.text);
    const features = buildFeatureVector(slots, keywordHits);
    traces.push({
      id: "encode",
      label: STAGES[0].label,
      region: STAGES[0].region,
      summary: `${slots.length} quantities, ${keywordHits.length} keyword hits`,
      details: slots.length ? slots.map((s) => `${s.text} → ${s.unit}`) : ["No quantities found"],
      activation: Math.min(1, 0.3 + slots.length * 0.15),
    });

    // ── Stage 2: classify (mushroom bodies) ───────────────────────────
    let input = features;
    if (this.lesion.type === "optic-lobe") {
      const scrambled = slots.map((s) => ({ ...s, unit: scrambleUnit(s.unit) }));
      input = buildFeatureVector(scrambled, keywordHits);
    }
    let probs: number[];
    if (this.lesion.type === "mushroom-bodies") {
      probs = uniformProbs();
      traces.push({
        id: "classify",
        label: STAGES[1].label,
        region: STAGES[1].region,
        summary: "Lesioned: flat guesses",
        details: ["Mushroom bodies ablated: topic guess is chance (1/12 ≈ 8%)"],
        activation: 0.1,
      });
    } else {
      // central complex bias: innate keyword priors multiply the learned
      // probabilities (additive in log space), like innate + learned pathways
      const biased = blendPriors(this.network.forward(input).probs, keywordPriors(problem.text, TOPIC_LIST));
      // episodic recall: a phrasing the HUMAN taught overrides classification
      // outright — their verdict is authoritative for problems it recognizes
      const taught = this.feedback.lookup(problem.text);
      probs = taught ? TOPIC_LIST.map((t) => (t === taught ? 1 : 0)) : biased;
      const top = ranked(probs)[0];
      traces.push({
        id: "classify",
        label: STAGES[1].label,
        region: STAGES[1].region,
        summary: taught ? `Recalled ${taught} from feedback` : `Predicted ${top[0]} at ${pct(top[1])}%`,
        details: taught
          ? [`A human taught the fly: this is a ${taught} problem`, `memory: ${this.feedback.size} taught phrasing(s)`]
          : ranked(probs).slice(0, 3).map(([t, p]) => `${t}: ${pct(p)}%`),
        activation: top[1],
      });
    }
    const predicted = argmaxTopic(probs);
    const correctTopic = problem.topic;
    const confidence = probs[TOPIC_LIST.indexOf(predicted)] ?? 0;

    // ── Stage 3: route (central complex) ──────────────────────────────
    let circuitTopic: Topic = predicted;
    if (this.lesion.type === "central-complex") {
      circuitTopic = this.lesionRng!.pick(TOPIC_LIST);
      traces.push({
        id: "route",
        label: STAGES[2].label,
        region: STAGES[2].region,
        summary: `Lesioned, random circuit: ${circuitTopic}`,
        details: ["Fan-shaped body scrambled: routing is random"],
        activation: 0.2,
      });
    } else {
      traces.push({
        id: "route",
        label: STAGES[2].label,
        region: STAGES[2].region,
        summary: `Engage the ${circuitTopic} solver`,
        details: [`Confidence ${pct(confidence)}% → motor program "solve ${circuitTopic}"`],
        activation: 0.5 + confidence * 0.5,
      });
    }

    // ── motor lesion: garbage answer ──────────────────────────────────
    if (this.lesion.type === "motor") {
      traces.push({
        id: "compute",
        label: STAGES[3].label,
        region: STAGES[3].region,
        summary: "Leg circuits lesioned: scribbles instead of math",
        details: ["Motor program ran but produced garbage"],
        activation: 0.15,
      });
      traces.push({
        id: "answer",
        label: STAGES[4].label,
        region: STAGES[4].region,
        summary: problem.origin === "user" ? "No coherent answer: leg circuits lesioned" : "No coherent answer",
        details: ["The fly draws a small spiral on the paper instead."],
        activation: 0.2,
      });
      return {
        problem,
        slots,
        keywordHits,
        topicProbs: toTopicMap(probs),
        predicted,
        correctTopic,
        confidence,
        circuit: circuitTopic,
        answerIndex: -1,
        correct: false,
        stages: traces,
      };
    }

    // ── Stage 4: compute (motor circuit, with bind-check reroute) ────
    const ctx = { slots, keywordHits, text: problem.text };
    const routedTopic = circuitTopic;
    // A question about a table value ("what is g on Mars?") is a lookup, not a
    // derivation — the constants table answers it before any circuit runs.
    const cAnswer = constantAnswer(problem.text);
    // A standard textbook setup (an Atwood machine, an RC circuit charging) is
    // recognized outright and solved with its own equation. Recognizing it is
    // the classifier's and router's work, so a fly lesioned there gets no such
    // shortcut and falls through to whatever circuit it was sent to.
    const routingIntact = this.lesion.type !== "mushroom-bodies" && this.lesion.type !== "central-complex";
    const textbook = !cAnswer && routingIntact ? textbookAnswer(ctx, finalQuestion(problem.text)) : undefined;
    // If the routed circuit uses none of the slot families the problem
    // actually contains, it cannot bind anything — reroute to the
    // highest-ranked circuit that CAN. A computed zero is a legitimate
    // answer (v = 0, equilibrium, …) and is never rerouted.
    const present = new Set(slots.map((s) => s.unit));
    const canBind = (topic: Topic): boolean =>
      (TOPIC_FAMILIES[topic] ?? []).some((f) => present.has(f));
    if (!cAnswer && !textbook && !canBind(circuitTopic)) {
      for (const [topic] of ranked(probs)) {
        if (topic === routedTopic || !canBind(topic)) continue;
        circuitTopic = topic;
        break;
      }
    }
    const mod = topicModule(circuitTopic);
    let result: SolveResult = cAnswer
      ? { value: cAnswer.value, unit: cAnswer.unit }
      : (textbook ?? mod.solve(ctx));
    // answer-family check: if the question asks for a KIND of quantity this
    // circuit can't produce (wrong unit — volts for an amps question), try
    // the next-ranked circuits that can. A number in the wrong family is a
    // wrong answer even when the arithmetic is perfect.
    const wanted = wantedUnits(problem.text);
    const ok = (r: typeof result) =>
      r.concept !== undefined || (Number.isFinite(r.value) && (!wanted || wanted.includes(r.unit)));
    // A circuit that produced the wrong KIND of answer — or nothing at all —
    // gets the same second chance the bind-check gives it before solving: try
    // the other circuits that could bind this problem. With no unit family to
    // aim at, a concept answer beats a stray number.
    // "explain …" / "derive …" questions want a concept — a stray number from
    // an unrelated circuit is not an answer to them, even when the phrasing
    // trips a unit-family rule ("…fictitious force – explain …")
    const conceptQ = /explain|derive|sketch|show that|distinguish|parametric/.test(finalQuestion(problem.text));
    const failed = conceptQ
      ? result.concept === undefined
      : wanted
        ? !ok(result)
        : result.concept === undefined && !Number.isFinite(result.value);
    if (!cAnswer && !textbook && !lesioned && failed) {
      // with no quantities at all, every circuit is equally able to "bind"
      const alts = ranked(probs)
        .filter(([topic]) => topic !== circuitTopic && (present.size === 0 || canBind(topic)))
        .map(([topic]) => ({ topic, r: topicModule(topic).solve(ctx) }));
      const pick = conceptQ
        ? alts.find(({ r }) => r.concept !== undefined)
        : wanted
          ? alts.find(
              ({ r }) =>
                r.concept === undefined && Number.isFinite(r.value) && wanted.includes(r.unit),
            )
          : (alts.find(({ r }) => r.concept !== undefined) ??
            alts.find(({ r }) => Number.isFinite(r.value)));
      if (pick) {
        circuitTopic = pick.topic;
        result = pick.r;
      }
    }

    // ── last resort: search the equation sheet dimensionally ─────────
    // Nothing hand-written bound this phrasing, so look for a sheet entry
    // whose variables all bind and whose answer is the kind the question
    // wants. It runs only after both second chances above, so it can never
    // override a working circuit — and it is free to decline.
    let rescued: RescueResult | undefined;
    const vars = tokenizeVars(problem.text);
    const wantSymbolic = wantsSymbolicQuestion(problem.text);
    const rescueOpts = {
      slots,
      text: problem.text,
      wanted: wanted?.map((u) => familyForUnit(u)).filter((f): f is UnitFamily => !!f),
      rankedTopics: ranked(probs).map(([t]) => t),
      circuitTopic,
      vars,
      wantSymbolic,
    };
    if (!cAnswer && result.concept === undefined && !Number.isFinite(result.value)) {
      const rescue = rescueSolve(rescueOpts);
      if (rescue) {
        rescued = rescue;
        result = { value: rescue.value, unit: rescue.unit };
      }
    }
    // "in terms of m and v" wants the EXPRESSION, so a circuit that happily
    // computed a number has not answered the question — go back to the
    // sheet with symbols in play. The number is still reported alongside it.
    if (!cAnswer && wantSymbolic && result.concept === undefined && rescued?.symbolic === undefined) {
      const symbolicRescue = rescueSolve({ ...rescueOpts, wantSymbolic: true });
      if (symbolicRescue?.symbolic) {
        rescued ??= symbolicRescue;
        if (!Number.isFinite(result.value) && Number.isFinite(symbolicRescue.value)) {
          result = { value: symbolicRescue.value, unit: symbolicRescue.unit };
        }
      }
    }
    const symbolicAnswer = rescued?.symbolic;
    // "which equation do I use for …?" — the sheet answers about itself
    let conceptCitation: Citation | undefined;
    if (!cAnswer && rescued === undefined && result.concept === undefined && !Number.isFinite(result.value)) {
      conceptCitation = equationForConcept(problem.text, circuitTopic);
      if (conceptCitation) result = { value: NaN, unit: "concept", concept: conceptCitation.display };
    }
    const numericPick =
      result.concept !== undefined
        ? matchConcept(problem.choices, result.concept)
        : pickChoice(problem.choices, result.value, result.unit, result.displayScale, result.displaySuffix);
    // an option written "mv²/r" holds no number to match against, so fall back
    // to comparing the two expressions themselves
    const answerIndex =
      numericPick < 0 && symbolicAnswer
        ? pickSymbolicChoice(problem.choices, symbolicAnswer.sym)
        : numericPick;

    // what the fly actually used: the equation from the sheet, and the
    // constants it looked up because the problem implied them
    const cite: Citation | undefined = rescued
      ? { display: rescued.display, section: rescued.section, equationId: rescued.equationId }
      : result.concept !== undefined
        ? conceptCitation
        : citeEquation(slots, familyForUnit(result.unit) ?? "", circuitTopic);
    const cited = suppliedConstants(problem.text);
    const computeDetails: string[] = [
      cAnswer
        ? `Read off the constants table: ${cAnswer.primary.display} (${cAnswer.how})`
        : textbook
          ? `Recognized a standard setup: ${textbook.equation}`
          : circuitTopic !== routedTopic
          ? `Rerouted: the ${routedTopic} circuit couldn't bind this phrasing, but the ${circuitTopic} circuit could`
          : `Bound slots to the standard ${circuitTopic} equation`,
      result.concept !== undefined
        ? `Conceptual answer: ${result.concept}`
        : `Computed ${fmt(result.value / (result.displayScale ?? 1))} ${result.unit}${result.displaySuffix ? ` ${result.displaySuffix}` : ""}`,
    ];
    if (rescued) {
      computeDetails.unshift(
        `No circuit covered this. Solved dimensionally from ${rescued.section}: ${rescued.display}`,
      );
      const sub = Object.entries(rescued.bindings)
        .map(([k, v]) => `${k} = ${fmt(v)}`)
        .join(", ");
      if (sub) computeDetails.push(`Substituted ${sub}`);
      if (rescued.runnersUp.length) {
        computeDetails.push(`Also considered ${rescued.runnersUp.join(" · ")}`);
      }
    }
    if (cite) computeDetails.push(`Equation sheet: ${cite.display} · ${cite.section}`);
    if (cited.length) {
      computeDetails.push(
        `Constants used: ${cited.slice(0, 3).map((c) => c.constant.display).join(", ")}`,
      );
    }
    computeDetails.push(
      answerIndex >= 0 ? `Matched to choice "${problem.choices[answerIndex].text}"` : "No choice matched the computed value",
    );

    traces.push({
      id: "compute",
      label: STAGES[3].label,
      region: STAGES[3].region,
      summary:
        result.concept !== undefined
          ? `${circuitTopic} circuit → concept: ${result.concept}`
          : `${circuitTopic} circuit → ${fmt(result.value)} ${result.unit}`,
      details: computeDetails,
      activation: 0.8,
    });

    // ── Stage 5: answer (legs + pencil) ───────────────────────────────
    const freeform = problem.origin === "user";
    const correct = freeform ? false : answerIndex === problem.answer;
    // freeform has no choices, so answerIndex is meaningless there — the fly
    // "answered" iff its circuit produced a value (circuits return NaN when
    // they couldn't compute; a computed 0 is a legitimate answer) or a
    // concept phrase — or it produced an expression in the problem's variables
    const numericText = Number.isFinite(result.value)
      ? `${fmt(result.value / (result.displayScale ?? 1))} ${result.unit}${result.displaySuffix ? ` ${result.displaySuffix}` : ""}`
      : undefined;
    const solved = result.concept !== undefined || numericText !== undefined || symbolicAnswer !== undefined;
    const computedAnswer: string | null = solved
      ? result.concept !== undefined
        ? result.concept
        : symbolicAnswer && numericText === undefined
          ? symbolicAnswer.expression
          : numericText!
      : null;
    // both ways at once when the symbols happen to be known: "mv²/r — 10.7 N"
    const bothWays =
      symbolicAnswer && numericText ? `${symbolicAnswer.expression}: ${numericText} for the given values` : undefined;
    traces.push({
      id: "answer",
      label: STAGES[4].label,
      region: STAGES[4].region,
      summary: freeform
        ? solved
          ? `Answer: ${bothWays ?? computedAnswer}`
          : "The fly couldn't quite solve this one"
        : correct
          ? `Choice ${letter(answerIndex)}: correct`
          : `Choice ${answerIndex >= 0 ? letter(answerIndex) : "–"}: expected ${letter(problem.answer)}`,
      details: freeform
        ? [
            solved
              ? "Penciled onto the paper, no answer key to grade against"
              : "No circuit produced a value for this phrasing",
            ...(symbolicAnswer
              ? [
                  `Answered in terms of ${symbolicAnswer.variables.join(", ")}`,
                  ...(symbolicAnswer.value === undefined
                    ? []
                    : [`Those symbols are known here, so it also comes to ${fmt(symbolicAnswer.value)} ${result.unit}`]),
                ]
              : []),
          ]
        : correct
          ? ["Wing buzz + happy leg wiggle"]
          : ["Slump. Antennae droop. Next problem."],
      activation: freeform ? (solved ? 0.9 : 0.3) : correct ? 0.9 : 0.3,
    });
    if (lesioned) {
      traces[traces.length - 1].details.push(
        `Lesioned: ${this.lesion.type}. This answer reflects the damaged brain.`,
      );
    }

    return {
      problem,
      slots,
      keywordHits,
      topicProbs: toTopicMap(probs),
      predicted,
      correctTopic,
      confidence,
      circuit: circuitTopic,
      answerIndex,
      correct,
      computedAnswer,
      computedSymbolic: symbolicAnswer?.expression ?? null,
      stages: traces,
    };
  }
}

// ── helpers ───────────────────────────────────────────────────────────

/** Slot families each topic's circuit can bind, for the reroute check. */
const TOPIC_FAMILIES: Record<Topic, string[]> = {
  kinematics: ["velocity", "acceleration", "time", "length", "angular-vel", "frequency"],
  newton: ["force", "mass", "acceleration", "velocity", "time", "mu-coeff", "angle", "length"],
  energy: ["mass", "velocity", "length", "force", "spring-k", "power"],
  momentum: ["mass", "velocity", "force", "time"],
  rotation: ["inertia", "torque", "angular-vel", "angular-acc", "length", "force", "time", "frequency"],
  shm: ["mass", "spring-k", "length", "time", "frequency", "angular-vel"],
  gravitation: ["mass", "length", "velocity", "time", "acceleration", "force"],
  electrostatics: ["charge", "length", "field-e", "mass", "force"],
  capacitors: ["capacitance", "voltage", "charge", "length", "area"],
  circuits: ["voltage", "resistance", "current", "capacitance", "charge", "time"],
  magnetism: ["field-b", "charge", "velocity", "length", "current", "force", "mass"],
  induction: ["flux", "turns", "field-b-rate", "length", "resistance", "time", "area", "frequency", "inductance", "current"],
};

/**
 * What kind of answer the question asks for, from the phrasing of its final
 * sentence: the unit family the answer must carry. First match wins, most
 * specific phrasing first. Null = no confident read.
 */
const WANTED_UNITS: Array<[RegExp, string[]]> = [
  [/torque/, ["N·m"]],
  // questions that ASK for a mass (never "force on a 2 kg mass")
  [/(?:what|which|find|determine|calculate|estimate)(?:\s+\w+){0,2}\s+(?:total\s+)?mass\b/, ["kg"]],
  [/angular (velocity|speed)|\bω\b/, ["rad/s"]],
  [/angular acceleration/, ["rad/s²"]],
  [/impulse|momentum/, ["kg·m/s"]],
  [/energy|work|heat/, ["J"]],
  [/power/, ["W"]],
  [/at what separation|what is the separation|find the separation|determine the separation|how far apart/, ["m"]],
  [/force|weight|tension|push|pull/, ["N"]],
  [/capacitance/, ["μF"]],
  [/resistance/, ["Ω"]],
  [/current/, ["A"]],
  [/electric field/, ["N/C"]],
  [/charge|coulomb/, ["C", "μC"]],
  [
    /what is the (?:minimum |maximum )?(?:value of )?(?:μ|coefficient)|find the (?:minimum |maximum )?(?:μ|coefficient)|determine the (?:minimum |maximum )?(?:μ|coefficient)|minimum value of/,
    ["μs"],
  ],
  [/voltage|potential difference|\bemf\b|\bvolts\b/, ["V"]],
  [/frequency/, ["Hz"]],
  [
    /what is (?:the |its |their )?period|what period|find the period|determine the period|calculate the period|period of (?:the |this |its )?(?:motion|orbit|oscillation|swing|pendulum|revolution)|period\??$/,
    ["s"],
  ],
  [/how long (?:does|to|it|will|would)|amount of time|point in time|time (?:does it take|to|it can|for the|needed|required|at which)/, ["s"]],
  // radius-asking phrasings ("determine the minimum radius turn … at this
  // speed") claim the answer before the acceleration/speed rules can — a
  // mention of radius alone ("speed … with radius 50 m") never matches
  [
    /\b(?:what|which|find|determine|calculate|its|their|the|its own)\s+(?:orbital\s+)?radius\b/,
    ["m"],
  ],
  [
    /radius (?:at which|of the (?:turn|circle|orbit|station))|(?:minimum|maximum|tightest|smallest|what|which|find|determine|calculate)(?:\s+\w+){0,3}\s+radius\b/,
    ["m"],
  ],
  [/acceleration|deceleration|\baccelerate/, ["m/s²"]],
  [/speed|velocity|how fast/, ["m/s"]],
  [/how high|height|how far|distance|\brange\b/, ["m"]],
  [/\baltitude\b/, ["m"]],
];

/**
 * The final question fragment of the text. Abbreviations ("Sag. A.") and
 * one-word tails ("Explain.") split badly, so a stubby tail is merged with
 * the sentence before it.
 */
export function finalQuestion(text: string): string {
  // a trailing aside — "(I = MR²)", "(hint: ignore air)" — is not the question
  const stripped = text.trim().replace(/\s*\([^()]*\)\s*$/, "");
  const sentences = stripped.split(/(?<=[.?])\s+/);
  const tail = sentences.pop() ?? "";
  const q = tail.split(/\s+/).filter(Boolean).length < 3 && sentences.length ? `${sentences.pop()} ${tail}` : tail;
  return q.toLowerCase();
}

/** The unit the question asks for, read from its final sentence. */
export function wantedUnits(text: string): string[] | null {
  const q = finalQuestion(text);
  for (const [re, units] of WANTED_UNITS) if (re.test(q)) return units;
  return null;
}

function argmaxTopic(probs: number[]): Topic {
  let best = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i;
  return TOPIC_LIST[best];
}

function ranked(probs: number[]): [Topic, number][] {
  return TOPIC_LIST.map((t, i) => [t, probs[i]] as [Topic, number]).sort((a, b) => b[1] - a[1]);
}

function uniformProbs(): number[] {
  return new Array(TOPIC_LIST.length).fill(1 / TOPIC_LIST.length);
}

function toTopicMap(probs: number[]): Record<Topic, number> {
  const map = {} as Record<Topic, number>;
  TOPIC_LIST.forEach((t, i) => (map[t] = probs[i]));
  return map;
}

function pct(x: number): string {
  return (x * 100).toFixed(0);
}

function letter(i: number): string {
  return i >= 0 && i < 5 ? "ABCDE"[i] : "–";
}

/** Find the choice whose value best matches the computed value (scale-aware). */
function pickChoice(
  choices: { text: string }[],
  value: number,
  unit: string,
  displayScale = 1,
  displaySuffix = "",
): number {
  if (!Number.isFinite(value)) return -1;
  const shown = value / displayScale;

  // exact string match first (formatted value + unit + optional suffix)
  const target = `${fmt(shown)} ${unit}${displaySuffix}`;
  const exact = choices.findIndex((c) => c.text === target);
  if (exact >= 0) return exact;

  // numeric match: convert each choice's number back to SI via displayScale
  let best = -1;
  let bestScore = Infinity;
  choices.forEach((c, i) => {
    const m = c.text.match(/-?[\d.]+(?:×10[⁻⁰¹²³⁴⁵⁶⁷⁸⁹⁺]+)?/);
    if (!m) return;
    const v = parseChoiceNumber(m[0]);
    if (!Number.isFinite(v)) return;
    const vSI = v * displayScale;
    let score = Math.abs(vSI - value) / Math.max(Math.abs(value), 1e-12);
    if (displaySuffix && !c.text.includes(displaySuffix)) score += 10;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  // only accept close matches
  return bestScore < 0.02 ? best : -1;
}

/** Match a concept answer to the choice containing its phrase. */
function matchConcept(choices: { text: string }[], concept: string): number {  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const c = norm(concept);
  let idx = choices.findIndex((ch) => norm(ch.text).includes(c));
  if (idx >= 0) return idx;

  const aliases: Record<string, string[]> = {
    "v₀/√2": ["v₀/√2", "v0/√2"],
    "1/9 of original": ["1/9"],
    "1/4 of original": ["1/4"],
    "opposes-the-change": ["opposes the change"],
    "at equilibrium": ["at equilibrium"],
  };
  for (const alias of aliases[c] ?? []) {
    idx = choices.findIndex((ch) => norm(ch.text).includes(alias));
    if (idx >= 0) return idx;
  }
  return -1;
}

/** "in terms of m and v", "expressed in terms of …", "as a function of …". */
const SYMBOLIC_ASK = /\b(?:in|expressed|express)\s+terms\s+of\b|\bas a function of\b/i;

function wantsSymbolicQuestion(text: string): boolean {
  return SYMBOLIC_ASK.test(text);
}

/**
 * Awkward, mutually distinct values for probing. When two expressions look
 * different but might mean the same thing, the only way to find out is
 * to evaluate both at numbers where an accidental agreement is implausible.
 */
const PROBES = [2.31, 5.7, 1.13, 8.29, 3.77, 6.05, 1.91, 4.43, 7.19, 2.87];

/**
 * Match a symbolic answer to a multiple-choice option that is itself an
 * expression. Two passes: exact canonical equality (`mv²/r` written five
 * different ways still matches), then a numeric probe for forms that canonical
 * treats as different but that agree once you substitute — `1/2 mv²` against
 * `mv²/2`.
 *
 * Deliberately conservative: the probe pass only runs when both sides mention
 * exactly the same set of variables, so a distractor can never be matched by
 * luck.
 */
function pickSymbolicChoice(choices: { text: string }[], sym: Sym): number {
  const target = canonical(sym);
  const targetNames = symbolsOf(sym);
  if (!targetNames.length) return -1;
  const lower = (s: string): string => s.toLowerCase();
  const targetLower = targetNames.map(lower);

  let exact = -1;
  let best = -1;
  let bestScore = Infinity;
  choices.forEach((c, i) => {
    if (exact >= 0) return;
    const parsed = parseChoiceExpression(c.text);
    if (parsed === undefined) return;
    if (canonical(parsed) === target) {
      exact = i;
      return;
    }
    const names = symbolsOf(parsed);
    const namesLower = names.map(lower);
    if (namesLower.length !== targetLower.length) return;
    if (!targetLower.every((n) => namesLower.includes(n))) return;
    const subs: Record<string, number> = {};
    for (const n of [...targetNames, ...names]) {
      subs[n] = PROBES[n.charCodeAt(0) % PROBES.length];
    }
    const mine = materialize(sym, subs);
    const theirs = materialize(parsed, subs);
    if (mine === undefined || theirs === undefined) return;
    const score = Math.abs(mine - theirs) / Math.max(Math.abs(mine), 1e-12);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return exact >= 0 ? exact : bestScore < 0.02 ? best : -1;
}

function scrambleUnit(unit: string): string {
  const families = [
    "length", "time", "velocity", "acceleration", "mass",
    "force", "energy", "charge", "field-b",
  ];
  const idx = families.indexOf(unit);
  return families[(idx + 3) % families.length];
}
