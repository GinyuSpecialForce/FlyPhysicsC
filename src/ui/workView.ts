/**
 * The fly's work: the whole trace laid out end to end, revealed once the fly
 * has an answer.
 *
 * The timeline deliberately shows one stage at a time and the detail card is
 * overwritten as the show moves on — good for watching, useless for checking.
 * This is the same ThoughtRecord rendered in full: what the fly read off the
 * page, what it classified, which circuit ran, every equation it cited and
 * every substitution it made. Nothing here is recomputed; it is the record the
 * pipeline already produced, printed.
 *
 * `renderWork` is a pure function of the record so it can be tested without a
 * DOM (vitest runs in node here). The WorkSheet class is only the wiring.
 */
import { TOPIC_LIST } from "../core/features";
import { STAGES } from "../core/stages";
import { fmt } from "../core/format";
import type { ThoughtRecord } from "../core/types";
import { byId, esc } from "./dom";

/** Colour for a stage, from the one definition the 3D hologram also uses. */
function stageColor(id: string): string {
  return STAGES.find((s) => s.id === id)?.color ?? "#9aa5b8";
}

/** A user's own question has no key, so "correct" would be a lie. */
function isGraded(rec: ThoughtRecord): boolean {
  return rec.problem.origin !== "user";
}

function headerHtml(rec: ThoughtRecord): string {
  // the answer stage's own summary already words every case correctly
  const summary = rec.stages.find((s) => s.id === "answer")?.summary ?? "No answer.";
  const numeric = rec.computedAnswer;
  const symbolic = rec.computedSymbolic;
  const solved = isGraded(rec) ? rec.correct : numeric != null || symbolic != null;
  // when the summary already ends in the number ("mv²/r — 10.7 N for the
  // given values"), a subline repeating it is just noise
  const subline = numeric && !summary.includes(numeric) ? numeric : "";
  return `<div class="work-head ${solved ? "good" : "bad"}">
    <div class="work-answer">${esc(summary)}</div>
    ${subline ? `<div class="work-answer-sub">${esc(subline)}</div>` : ""}
  </div>`;
}

function sourceHtml(rec: ThoughtRecord): string {
  const src = rec.source;
  if (!src) return "";
  const pct = Math.round(src.confidence * 100);
  const transcript = src.transcript.slice(0, 400);
  return `<section class="work-sec">
    <h3>How the question arrived</h3>
    <p>Read from <b>${esc(src.fileName)}</b> at ${pct}% confidence.</p>
    <pre class="work-transcript">${esc(transcript)}${src.transcript.length > 400 ? "…" : ""}</pre>
    ${src.flags.length ? `<p class="work-flag">Check these numbers: ${esc(src.flags.join(", "))}</p>` : ""}
    ${src.repairs.length ? `<p class="muted">Repaired while normalizing: ${esc(src.repairs.join(", "))}</p>` : ""}
  </section>`;
}

function givensHtml(rec: ThoughtRecord): string {
  if (!rec.slots.length) {
    return `<section class="work-sec"><h3>What it read off the page</h3>
      <p class="muted">No quantities were found in this phrasing.</p></section>`;
  }
  const rows = rec.slots
    .map(
      (s) => `<tr>
        <td>${esc(s.text)}</td>
        <td class="muted">${esc(s.unit)}</td>
        <td class="num">${esc(fmt(s.value))}</td>
      </tr>`,
    )
    .join("");
  return `<section class="work-sec">
    <h3>What it read off the page</h3>
    <table class="work-table">
      <thead><tr><th>Written as</th><th>Read as</th><th class="num">SI value</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${rec.keywordHits.length ? `<p class="muted">${rec.keywordHits.length} keyword hit${rec.keywordHits.length === 1 ? "" : "s"} fed the classifier.</p>` : ""}
  </section>`;
}

function topicHtml(rec: ThoughtRecord): string {
  // the classifier's full 12-way output, sorted — where the mass actually went
  const ranked = TOPIC_LIST.map((t) => [t, rec.topicProbs[t] ?? 0] as const).sort((a, b) => b[1] - a[1]);
  const rows = ranked
    .map(([t, p]) => {
      const pct = Math.round(p * 100);
      const predicted = t === rec.predicted;
      const truth = isGraded(rec) && t === rec.correctTopic;
      // "warn" means "got this one wrong" — which is only knowable on a
      // question that has a key, so an ungraded pick stays neutral
      const tone = !isGraded(rec)
        ? "accent"
        : predicted && truth
          ? "good"
          : predicted
            ? "warn"
            : truth
              ? "good"
              : "accent";
      const mark = predicted ? (truth ? " ← predicted" : " ← predicted") : truth ? " ← actually this" : "";
      return `<div class="topic-row">
        <span class="topic-name">${esc(t)}</span>
        <div class="topic-bar"><div class="${tone}" style="width:${pct}%"></div></div>
        <span class="topic-pct">${pct}%</span>
        <span class="topic-mark${predicted || truth ? " on" : ""}">${esc(mark)}</span>
      </div>`;
    })
    .join("");
  const head = isGraded(rec) && rec.predicted !== rec.correctTopic
    ? `<p class="work-flag">Classified as <b>${esc(rec.predicted)}</b>, but the problem is really <b>${esc(rec.correctTopic)}</b>.</p>`
    : "";
  return `<section class="work-sec"><h3>How it classified the problem</h3>${head}
    <div class="work-topics">${rows}</div>
    <p class="muted">Routed to the <b>${esc(rec.circuit)}</b> motor circuit at ${Math.round(rec.confidence * 100)}% confidence.</p>
  </section>`;
}

function traceHtml(rec: ThoughtRecord): string {
  const steps = rec.stages
    .map((s, i) => {
      const color = stageColor(s.id);
      const details = s.details.map((d) => `<li>${esc(d)}</li>`).join("");
      return `<li class="work-step">
        <div class="work-step-head">
          <span class="work-step-num">${i + 1}</span>
          <b>${esc(s.label)}</b>
          <span class="work-step-region" style="color:${color}">${esc(s.region)}</span>
        </div>
        <div class="work-step-sum">${esc(s.summary)}</div>
        ${details ? `<ul>${details}</ul>` : ""}
      </li>`;
    })
    .join("");
  return `<section class="work-sec"><h3>Step by step</h3><ol class="work-steps">${steps}</ol></section>`;
}

/**
 * The whole trace as one HTML string. Pure: everything here is read off the
 * record, so the sheet can never disagree with what the fly actually did.
 */
export function renderWork(rec: ThoughtRecord): string {
  return [
    headerHtml(rec),
    sourceHtml(rec),
    givensHtml(rec),
    topicHtml(rec),
    traceHtml(rec),
  ].join("");
}

/** DOM wiring: hold the record, arm the button, open/close the sheet. */
export class WorkSheet {
  private record: ThoughtRecord | null = null;
  private armed = false;
  private showing = false;

  constructor() {
    byId("showWork").addEventListener("click", () => this.toggle());
    byId("workClose").addEventListener("click", () => this.close());
    // a click on the backdrop (not the sheet itself) dismisses it
    const overlay = byId("workOverlay");
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) this.close();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.showing) this.close();
    });
  }

  /** A new show begins — the last fly's work is stale, so take the sheet down. */
  begin(record: ThoughtRecord): void {
    this.record = record;
    this.close();
    this.arm(false);
  }

  /** No problem at all — forget the record entirely. */
  clear(): void {
    this.record = null;
    this.close();
    this.arm(false);
  }

  /** The fly produced an answer — its work is now worth showing. */
  answered(): void {
    this.arm(true);
  }

  /** Keyboard/button toggle. Does nothing until the fly has an answer. */
  toggle(): void {
    if (!this.armed) return;
    this.showing ? this.close() : this.show();
  }

  show(): void {
    if (!this.armed || !this.record) return;
    byId("workBody").innerHTML = renderWork(this.record);
    byId("workOverlay").classList.remove("hidden");
    (byId("showWork") as HTMLButtonElement).classList.add("active");
    this.showing = true;
  }

  close(): void {
    if (this.showing) byId("workOverlay").classList.add("hidden");
    (byId("showWork") as HTMLButtonElement).classList.remove("active");
    this.showing = false;
  }

  /** The button only exists once there is something to show. */
  private arm(on: boolean): void {
    this.armed = on;
    const btn = byId("showWork");
    btn.classList.toggle("hidden", !on);
    (btn as HTMLButtonElement).disabled = !on;
  }
}