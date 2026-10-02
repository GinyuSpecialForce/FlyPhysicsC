/**
 * The demo sequencer: owns the per-problem show — pseudo-stages, timings,
 * scorekeeping, and what the desk HUD shows at each moment. It never touches
 * the DOM or the scene directly; it calls the callbacks its owner provides.
 */
import type { ThoughtRecord } from "../core/types";

/** Seconds each stage id stays on screen. */
const STAGE_DURATIONS: Record<string, number> = {
  reading: 2.0,
  encode: 1.7,
  classify: 1.9,
  route: 1.5,
  compute: 2.3,
  answer: 3.2,
};

/** Fly animation state per pipeline stage. */
const STAGE_FLY: Record<string, string> = {
  reading: "reading",
  encode: "reading",
  classify: "thinking",
  route: "routing",
  compute: "scribbling",
  answer: "idle",
};

export interface SequencerCallbacks {
  /** Highlight a timeline stage ("reading" is the pseudo-stage). */
  highlightStage(id: string): void;
  /** Show a stage's detail panel ("reading" = the watching-the-fly card). */
  showStageDetail(id: string): void;
  /** Update HUD chrome (stage badge text). */
  setStageBadge(text: string): void;
  /** A pipeline stage began ("reading" pseudo-stage included). */
  onStageChange(id: string): void;
  /** Drive the fly's animation state. */
  setFlyState(state: string): void;
  /** Light up the brain hologram for a stage ("off" = dim). */
  activateBrain(stage: string): void;
  /** Camera director hook. */
  notifyCamera(stage: string): void;
  /** Paint the paper: highlighted choice indices (uses the current problem). */
  paintPaper(highlights: number[]): void;
  /** Mark the chosen/correct choices in the HUD. */
  markChoices(picked: number, correct: boolean, answer: number): void;
  /** Show the verdict line. */
  showVerdict(text: string, good: boolean): void;
  /** Update the running score badge. */
  setScore(correct: number, total: number): void;
  /** Brain pulse strength 0..1 (answer flash). */
  setBrainBeat(p: number): void;
}

export class Sequencer {
  private record: ThoughtRecord | null = null;
  private stageIdx = -1;
  private stageTime = 0;
  private scoreCorrect = 0;
  private scoreTotal = 0;
  private paused = false;
  private rested = false;

  constructor(private readonly cb: SequencerCallbacks) {}

  setPaused(p: boolean): void {
    this.paused = p;
  }

  /** Begin a new problem: reset to the reading pseudo-stage (and resume). */
  start(record: ThoughtRecord): void {
    this.record = record;
    this.stageIdx = -1;
    this.stageTime = 0;
    this.rested = false;
    this.paused = false; // a pause inspects the current problem only
    this.cb.setStageBadge("Reading");
    this.cb.showStageDetail("reading");
    this.cb.setFlyState("reading");
    this.cb.activateBrain("off");
    this.cb.notifyCamera("encode");
  }

  /** Advance the show by dt; holds on the answer when it finishes —
   *  the fly only works when handed a problem, and rests afterward. */
  tick(dt: number): void {
    if (!this.record || this.paused) return;
    this.stageTime += dt;
    const isReading = this.stageIdx === -1;
    const dur = isReading ? STAGE_DURATIONS.reading : (STAGE_DURATIONS[this.record.stages[this.stageIdx].id] ?? 2);

    if (this.stageTime >= dur) {
      if (isReading) {
        this.enterStage(0);
      } else if (this.stageIdx < this.record.stages.length - 1) {
        this.enterStage(this.stageIdx + 1);
      } else if (!this.rested) {
        // show's over: hold the answer on screen, dim the hologram,
        // and let the fly go back to grooming — no auto-advance
        this.rested = true;
        this.cb.setFlyState("idle");
        this.cb.activateBrain("off");
      }
    }
    // brain beat eases up after the answer flash (until it rests)
    if (!this.rested && this.stageIdx >= 0 && this.record.stages[this.stageIdx].id === "answer") {
      this.cb.setBrainBeat(Math.min(1, this.stageTime / STAGE_DURATIONS.answer));
    }
  }

  /** Back to idle: forget the current problem entirely. */
  clear(): void {
    this.record = null;
    this.stageIdx = -1;
    this.stageTime = 0;
    this.rested = false;
    this.paused = false;
  }

  private enterStage(idx: number): void {
    if (!this.record) return;
    this.stageIdx = idx;
    this.stageTime = 0;
    const isReading = idx === -1;
    const stage = isReading ? "reading" : this.record.stages[idx].id;
    this.cb.onStageChange(stage);

    this.cb.highlightStage(stage);
    this.cb.setStageBadge(isReading ? "Reading" : this.record.stages[idx].label);
    this.cb.setFlyState(STAGE_FLY[stage] ?? "idle");
    this.cb.activateBrain(stage === "reading" ? "off" : stage);
    if (!isReading) {
      this.cb.setBrainBeat(0);
      this.cb.notifyCamera(stage);
      this.cb.showStageDetail(stage);
    }

    if (stage === "answer" && this.record) {
      const s = this.record.stages[idx];
      const picked = this.record.answerIndex;
      const correct = this.record.correct;
      const freeform = this.record.problem.origin === "user";
      this.cb.paintPaper([picked >= 0 ? picked : 0]);
      this.cb.markChoices(picked, correct, this.record.problem.answer);
      // user problems have no answer key — they never count toward the score
      if (!freeform) {
        this.scoreTotal++;
        if (correct) this.scoreCorrect++;
      }
      this.cb.setScore(this.scoreCorrect, this.scoreTotal);
      // a freeform answer is a success when the fly actually computed one
      const happy = freeform ? this.record.computedAnswer != null : correct;
      this.cb.showVerdict(s.summary, happy);
      this.cb.setFlyState(happy ? "celebrate" : "slump");
      this.cb.setBrainBeat(0.001);
    }
  }
}
