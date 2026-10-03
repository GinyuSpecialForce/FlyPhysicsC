/**
 * App orchestrator: boots (training one real network while the bar moves),
 * then runs the 3D desk demo — the Sequencer walks each problem through the
 * pipeline stages while the fly reads, thinks, and answers. View-specific UI
 * lives in ui/* modules; this file only wires them together.
 */
import { createScene, type SceneHandles } from "./viz/scene";
import { CameraDirector, type CamMode } from "./viz/camera";
import { trainNetwork, evaluate } from "./core/train";
import type { Network } from "./core/network";
import { FlyBrain } from "./core/brain";
import { EVAL_BANK } from "./core/eval-bank";
import { generateMix } from "./core/bank";
import { TOPIC_LIST } from "./core/features";
import type { Topic } from "./core/features";
import { FeedbackMemory } from "./core/feedback";
import { Rng } from "./core/rng";
import { LESIONS, makeBrain } from "./core/lesions";
import type { LesionType } from "./core/lesions";
import type { Problem, ProblemSource, ThoughtRecord } from "./core/types";
import { FREEFORM_EXAMPLES } from "./core/freeform";
import { createBrainAtlas, type BrainAtlas } from "./viz/atlas";
import { byId, describeError, select } from "./ui/dom";
import { Sequencer } from "./ui/sequencer";
import { Timeline } from "./ui/timeline";
import { WorkSheet } from "./ui/workView";
import { initTrainView } from "./ui/trainView";
import { initLesionView, refreshLesionEvals } from "./ui/lesionView";
import { renderScience } from "./ui/scienceView";
import { renderReference } from "./ui/referenceView";
import { initOcrView } from "./ui/ocrView";

// ── dom helpers ─────────────────────────────────────────────────

function frame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

// ── boot: train ONE network while showing progress ──────────────
const bootMsg = byId("bootMsg");
const bootBar = byId("bootBar");

let network!: Network;

async function boot(): Promise<void> {
  const setBoot = (pct: number, msg: string) => {
    bootMsg.textContent = msg;
    bootBar.style.width = `${pct}%`;
  };

  setBoot(8, "Waking the mushroom bodies…");
  await frame();

  const chunks = 6;
  const samplesPerEpoch = 600;
  const chunkShare = 72 / chunks;
  let acc = 0;
  for (let i = 0; i < chunks; i++) {
    const result = trainNetwork(1337, 1, samplesPerEpoch);
    network = result.network;
    acc = evaluate(network).accuracy;
    setBoot(8 + (i + 1) * chunkShare, `Training on synthetic problem sets… epoch ${i + 1}/${chunks} — ${(acc * 100).toFixed(0)}% on the exam`);
    await frame();
  }

  setBoot(96, `Brain ready — ${(acc * 100).toFixed(0)}% on the exam`);
  await frame();

  startApp();
  setBoot(100, "Ready");
  setTimeout(() => byId("boot").classList.add("hidden"), 350);
}

// ── app state ───────────────────────────────────────────────────
let scene!: SceneHandles;
let director!: CameraDirector;
let deskBrain!: FlyBrain;
let lesion: LesionType = "none";
let problems: Problem[] = [];
let problemIdx = 0;
let freeformMode = false;
const rng = new Rng(2026);

// what the human teaches the fly — shared by every desk brain so learning
// survives re-runs and lesion switches (the network is shared too)
const feedbackMemory = new FeedbackMemory();
const learnedProblems = new Set<string>();
let lastFeedback: { text: string; topic: Topic } | null = null;

let timeline!: Timeline;
let sequencer!: Sequencer;
let work!: WorkSheet;

// atlas view state (lazily initialized on first visit)
let atlas: BrainAtlas | null = null;
let atlasBuilt = false;
let lastAtlasStage = "";

// the fly only works when handed a problem — nothing runs on its own
let hasActiveProblem = false;

function loadProblems(): void {
  // half eval bank (the real exam), half fresh synthetic for variety
  const shuffledEval = rng.shuffle(EVAL_BANK.slice());
  const synth = generateMix(TOPIC_LIST, 12, rng);
  problems = rng.shuffle([...shuffledEval.slice(0, 18), ...synth]);
  problemIdx = 0;
}

function startProblem(): void {
  hasActiveProblem = true;
  freeformMode = false;
  hideFreeform();
  hideFeedback();
  const problem = problems[problemIdx];
  deskBrain = makeBrain(network, { type: lesion }, feedbackMemory);
  const record: ThoughtRecord = deskBrain.solve(problem);
  // graded problems teach the fly from their answer key: reinforce a hit,
  // correct a miss (once per problem — re-renders don't double-learn)
  if (!learnedProblems.has(problem.id)) {
    learnedProblems.add(problem.id);
    deskBrain.learn(problem.text, problem.topic, record.correct ? 0.04 : 0.15);
  }

  byId("probNum").textContent = `#${problemIdx + 1}`;
  byId("problemText").textContent = problem.text;
  const choicesEl = byId("choices");
  choicesEl.innerHTML = "";
  record.problem.choices.forEach((c, i) => {
    const div = document.createElement("div");
    div.className = "choice";
    div.textContent = `${"ABCDE"[i]})  ${c.text}`;
    div.id = `choice-${i}`;
    choicesEl.appendChild(div);
  });
  const verdict = byId("verdict");
  verdict.textContent = "";
  verdict.className = "";

  timeline.show(record);
  sequencer.start(record);
  scene.setPaper(problem.text, problem.choices.map((c) => c.text), []);
}

function nextProblem(): void {
  problemIdx = (problemIdx + 1) % problems.length;
  startProblem();
}

/** The fly at rest: no problem, idle animation, dim hologram, hint on the paper. */
function showWaiting(): void {
  hasActiveProblem = false;
  freeformMode = false;
  hideFreeform();
  hideFeedback();
  sequencer.clear();
  byId("probNum").textContent = "—";
  byId("problemText").textContent = "The fly waits for a question.";
  byId("choices").innerHTML = "";
  const verdict = byId("verdict");
  verdict.textContent = "";
  verdict.className = "";
  byId("stageBadge").textContent = "";
  byId("timeline").innerHTML = "";
  byId("stageDetail").innerHTML = "";
  scene.setPaper(
    "(no problem set — the fly grooms itself and waits)\n\nAsk the fly — type any AP Physics C question\nPractice problem — pull one from the set",
    [],
    [],
  );
  scene.setFlyAnswer("");
  scene.fly.setState("idle");
  scene.brain.activate("off");
}

// ── freeform: hand the fly any question ─────────────────────────
/** The source of the last image read, if the last question came from a picture. */
let lastImageSource: ProblemSource | undefined;

function startFreeform(): void {
  try {
    const text = (byId("freeformInput") as HTMLTextAreaElement).value;
    const record = deskBrain.solveFreeform(text, {
      ocr: lastImageSource !== undefined,
      source: lastImageSource,
    });
    freeformMode = true;
    byId("probNum").textContent = record.problem.choices.length ? "(photo)" : "(typed)";
    byId("problemText").textContent = record.problem.text;
    // a photographed multiple-choice page keeps its options, so the fly can
    // match its answer against them like a real exam question
    const choicesEl = byId("choices");
    choicesEl.innerHTML = "";
    record.problem.choices.forEach((c, i) => {
      const div = document.createElement("div");
      div.className = "choice";
      div.textContent = `${"ABCDE"[i]})  ${c.text}`;
      div.id = `choice-${i}`;
      choicesEl.appendChild(div);
    });
    const verdict = byId("verdict");
    verdict.textContent = "";
    verdict.className = "";
    timeline.show(record);
    sequencer.start(record);
    scene.setFlyAnswer("");
    scene.setPaper(record.problem.text, record.problem.choices.map((c) => c.text), []);
  } catch (err) {
    // report what actually broke — swallowing it as a shrug is how a real
    // failure ends up looking like a mystery
    console.warn("[solve] freeform solve failed", err);
    const v = byId("verdict");
    v.textContent = describeError(err) || "The fly squints at the page.";
    v.className = "bad";
  }
}

/** Next-problem / “n” key: leave freeform mode first, then advance. */
function advance(): void {
  freeformMode = false;
  hideFreeform();
  nextProblem();
}

function showFreeformInput(): void {
  freeformMode = true;
  lastImageSource = undefined;
  sequencer.setPaused(true); // hold the current show while the user types
  hideFeedback();
  byId("freeformBox").classList.remove("hidden");
  byId("askFly").classList.add("hidden");
  byId("probNum").textContent = "(typed)";
  byId("problemText").textContent = "Write any AP Physics C question on the paper:";
  byId("choices").innerHTML = "";
  const verdict = byId("verdict");
  verdict.textContent = "";
  verdict.className = "";
  (byId("freeformInput") as HTMLTextAreaElement).focus();
}

function exitFreeform(): void {
  freeformMode = false;
  if (hasActiveProblem) startProblem();
  else showWaiting();
}

function hideFreeform(): void {
  byId("freeformBox").classList.add("hidden");
  byId("askFly").classList.remove("hidden");
}

// ── feedback: the human tells the fly right/wrong, and it learns ──
function showFeedback(text: string, topic: Topic): void {
  lastFeedback = { text, topic };
  byId("feedbackRow").classList.remove("hidden");
  byId("fbTeach").classList.add("hidden");
  byId("fbStatus").textContent = "";
  (byId("fbRight") as HTMLButtonElement).disabled = false;
  (byId("fbWrong") as HTMLButtonElement).disabled = false;
}

function hideFeedback(): void {
  byId("feedbackRow").classList.add("hidden");
  lastFeedback = null;
}

// ── views ───────────────────────────────────────────────────────
function switchView(name: string): void {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  byId(`view-${name}`).classList.add("active");
  document.querySelectorAll("#nav button[data-view]").forEach((b) => {
    b.classList.toggle("active", (b as HTMLElement).dataset.view === name);
  });
  if (name === "atlas") {
    if (!atlasBuilt) {
      buildAtlas();
      atlasBuilt = true;
    }
    atlas?.setVisible(true);
  } else {
    atlas?.setVisible(false);
  }
}

const REGION_TONE: Record<string, string> = {
  "Optic lobe": "#7fd4ff",
  "Mushroom bodies": "#7fa0e6",
  "Central complex": "#ffd166",
  VNC: "#8dffb0",
  "Antennal lobe": "#74e8c0",
  "Lateral horn": "#6fd9a8",
  "Central brain": "#8fb0ff",
  SEZ: "#8dffb0",
};

function buildAtlas(): void {
  atlas = createBrainAtlas(byId("atlasCanvas") as HTMLCanvasElement);
  // legend: one row per named neuropil
  const legend = byId("atlasLegend");
  const seen = new Set<string>();
  for (const r of atlas.regions) {
    if (!r.name || seen.has(r.name)) continue;
    seen.add(r.name);
    const row = document.createElement("div");
    row.className = "legend-row";
    row.dataset.name = r.name;
    const dotColor = REGION_TONE[r.group] ?? "#8fb0ff";
    row.innerHTML = `<span class="legend-dot" style="background:${dotColor}"></span><span>${r.name}</span>`;
    row.addEventListener("click", () => pickRegion(r.name));
    legend.appendChild(row);
  }
  atlas.onPick((name) => showRegionInfo(name));
}

function pickRegion(name: string): void {
  atlas?.select(name);
  showRegionInfo(name);
}

function showRegionInfo(name: string | null): void {
  const info = byId("atlasInfo");
  document.querySelectorAll(".legend-row").forEach((el) => el.classList.remove("selected"));
  if (!name || !atlas) {
    info.innerHTML = `<em>Click a region to inspect it.</em>`;
    return;
  }
  const region = atlas.regions.find((r) => r.name === name);
  document.querySelector(`.legend-row[data-name="${name}"]`)?.classList.add("selected");
  const stage = region?.stage;
  info.innerHTML = `<b>${name}</b>${region && region.group !== name ? ` <span class="atlas-group">· ${region.group}</span>` : ""}${stage ? ` <span class="atlas-group">· stage: ${stage}</span>` : ""}<br>${atlas.describe(name)}`;
}

/** Forward the live pipeline stage to the atlas, if it's watching. */
function syncAtlasStage(stage: string): void {
  if (!atlas || !atlasBuilt) return;
  if (stage === lastAtlasStage) return;
  lastAtlasStage = stage;
  atlas.activate(stage);
}

// ── wiring ──────────────────────────────────────────────────────
function wireUI(onLesionSelected: (type: LesionType) => void): void {
  document.querySelectorAll("#nav button[data-view]").forEach((b) => {
    b.addEventListener("click", () => switchView((b as HTMLElement).dataset.view!));
  });

  document.querySelectorAll(".cam-controls button").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".cam-controls button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      director.setMode((b as HTMLElement).dataset.cam as CamMode);
    });
  });

  byId("nextProblem").addEventListener("click", () => advance());
  byId("askFly").addEventListener("click", () => showFreeformInput());
  byId("backToSet").addEventListener("click", () => exitFreeform());
  byId("solveBtn").addEventListener("click", () => startFreeform());

  // a picture of a problem: the transcript lands in the same textarea, and the
  // fly solves it once the reading looks right
  initOcrView({
    onSolve: (_text, source, confident) => {
      lastImageSource = source;
      if (confident) startFreeform();
    },
  });

  const ffInput = byId("freeformInput") as HTMLTextAreaElement;
  ffInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      startFreeform();
    }
  });
  const exBox = byId("freeformExamples");
  for (const ex of FREEFORM_EXAMPLES) {
    const b = document.createElement("button");
    b.className = "freeform-example";
    b.textContent = ex;
    b.addEventListener("click", () => {
      ffInput.value = ex;
      lastImageSource = undefined;
      startFreeform();
    });
    exBox.appendChild(b);
  }

  // feedback: the human confirms or corrects the fly's freeform answers,
  // and the fly learns — episodic memory + a real SGD step
  const fbTopic = select("fbTopic");
  fbTopic.innerHTML = TOPIC_LIST.map((t) => `<option value="${t}">${t}</option>`).join("");
  byId("fbRight").addEventListener("click", () => {
    if (!lastFeedback) return;
    deskBrain.learn(lastFeedback.text, lastFeedback.topic, 0.25);
    byId("fbStatus").textContent = "Reinforced — the fly will trust this circuit on similar problems.";
    byId("fbTeach").classList.add("hidden");
    (byId("fbRight") as HTMLButtonElement).disabled = true;
    (byId("fbWrong") as HTMLButtonElement).disabled = true;
  });
  byId("fbWrong").addEventListener("click", () => {
    if (!lastFeedback) return;
    byId("fbTeach").classList.remove("hidden");
    byId("fbStatus").textContent = "What was it really about?";
  });
  byId("fbTeachBtn").addEventListener("click", () => {
    if (!lastFeedback) return;
    const topic = fbTopic.value as Topic;
    deskBrain.learn(lastFeedback.text, topic, 0.5);
    byId("fbStatus").textContent = `Taught: this is a ${topic} problem. Ask again — the fly remembers.`;
    byId("fbTeach").classList.add("hidden");
    (byId("fbRight") as HTMLButtonElement).disabled = true;
    (byId("fbWrong") as HTMLButtonElement).disabled = true;
  });

  // populate the desk lesion select from the registry — one source of truth
  const deskLesion = select("deskLesion");
  deskLesion.innerHTML = LESIONS.map((l) => `<option value="${l.type}">${l.label}</option>`).join("");
  deskLesion.addEventListener("change", () => {
    onLesionSelected(deskLesion.value as LesionType);
  });

  byId("perfToggle").addEventListener("click", () => {
    const btn = byId("perfToggle");
    const on = btn.classList.toggle("active");
    scene.setLowPower(on);
    btn.textContent = on ? "Low power: on" : "Low power";
  });

  window.addEventListener("keydown", (e) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT") return; // user is typing
    if (!byId("view-desk").classList.contains("active")) return;
    if (e.key === "n" || e.key === "N") advance();
    else if (e.key === "w" || e.key === "W") work.toggle();
  });
}

// ── main loop ───────────────────────────────────────────────────
function startApp(): void {
  scene = createScene(byId("sceneMount"));
  director = new CameraDirector();

  timeline = new Timeline(() => sequencer.setPaused(true));
  work = new WorkSheet();
  sequencer = new Sequencer({
    highlightStage: (id) => timeline.highlight(id),
    showStageDetail: (id) => timeline.showDetail(id),
    setStageBadge: (text) => {
      byId("stageBadge").textContent = text;
    },
    onStageChange: (id) => syncAtlasStage(id),
    setFlyState: (state) => scene.fly.setState(state as never),
    activateBrain: (stage) => scene.brain.activate(stage),
    notifyCamera: (stage) => director.notifyStage(stage),
    paintPaper: (highlights) => {
      if (freeformMode) {
        const rec = deskBrain.freeformRecord;
        if (rec) {
          // a question that asked for an answer in terms of variables gets the
          // expression penciled on the paper, not the number
          scene.setFlyAnswer(rec.computedSymbolic ?? rec.computedAnswer ?? "");
          scene.setPaper(rec.problem.text, rec.problem.choices.map((c) => c.text), highlights);
          return;
        }
      }
      const p = problems[problemIdx];
      scene.setPaper(p.text, p.choices.map((c) => c.text), highlights);
    },
    markChoices: (picked, correct, answer) => {
      // a question the fly was handed has no key to grade against — show its
      // pick neutrally instead of painting its own answer red
      const freeform = deskBrain.freeformRecord?.problem.origin === "user";
      // a typed or photographed question may carry no option list at all, and a
      // chip can go missing when a new problem replaces the old one mid-show,
      // so a null chip is normal here rather than an error
      const chip = (i: number): HTMLElement | null =>
        i >= 0 ? document.getElementById(`choice-${i}`) : null;
      chip(picked)?.classList.add(freeform ? "picked" : correct ? "correct" : "wrong");
      if (!freeform && !correct) chip(answer)?.classList.add("correct");
    },
    showVerdict: (text, good) => {
      const v = byId("verdict");
      v.textContent = text;
      v.className = good ? "good" : "bad";
      const rec = deskBrain.freeformRecord;
      if (freeformMode && rec && rec.problem.origin === "user") {
        showFeedback(rec.problem.text, rec.circuit);
      } else {
        hideFeedback();
      }
    },
    setScore: (correct, total) => {
      const badge = byId("scoreBadge");
      badge.textContent = `${correct} / ${total}`;
      badge.className = `badge ${correct === total ? "good" : "bad"}`;
    },
    setBrainBeat: (p) => scene.brain.setBeat(p),
    // the sequencer owns when a show starts, ends and answers, so the work
    // sheet arms itself off the same signal the verdict line uses
    onShowStart: (record) => (record ? work.begin(record) : work.clear()),
    onAnswered: () => work.answered(),
  });

  const applyLesion = (type: LesionType): void => {
    lesion = type;
    select("deskLesion").value = type;
    deskBrain = makeBrain(network, { type }, feedbackMemory);
    if (!byId("view-desk").classList.contains("active")) return;
    if (freeformMode) {
      const ff = byId("freeformInput") as HTMLTextAreaElement;
      if (ff.value.trim()) startFreeform();
      else showFreeformInput();
      return;
    }
    // re-solve only what the fly was actually given — a waiting fly stays waiting
    if (hasActiveProblem) startProblem();
  };

  loadProblems();
  renderScience();
  renderReference();
  wireUI(applyLesion);
  initTrainView((trained) => {
    network = trained;
    learnedProblems.clear(); // a fresh network relearns the set
    deskBrain = makeBrain(network, { type: lesion }, feedbackMemory);
    if (byId("view-desk").classList.contains("active") && freeformMode) {
      const ff = byId("freeformInput") as HTMLTextAreaElement;
      if (ff.value.trim()) startFreeform();
    }
    refreshLesionEvals(network, applyLesion);
  });

  initLesionView(() => network, applyLesion);

  // the fly's brain exists before anything is asked of it
  deskBrain = makeBrain(network, { type: lesion }, feedbackMemory);

  showWaiting();

  let last = performance.now();
  function loop(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    // Sequencer runs on every view so the Brain Atlas gets live stage pulses.
    // It only has a show while a problem is active — a waiting fly idles.
    // Anything thrown here escapes every catch in the app and would take the
    // whole animation loop down with it, so each frame is isolated.
    try {
      sequencer.tick(dt);
      if (byId("view-desk").classList.contains("active")) {
        director.tick(dt, scene.camera);
      }
      if (atlas && byId("view-atlas").classList.contains("active")) {
        atlas.tick(dt, t);
      }
      scene.tick(dt, t);
    } catch (err) {
      console.warn("[loop] frame aborted", describeError(err), err);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

boot();
