/**
 * Thought-timeline HUD: stage rows (reading pseudo-stage + pipeline stages),
 * the detail card, and pause-on-inspect. Colors come from core/stages.ts —
 * one definition, shared with the 3D hologram.
 */
import { STAGES } from "../core/stages";
import type { ThoughtRecord } from "../core/types";
import { byId, esc } from "./dom";

const READING = { id: "reading", label: "Reading", region: "Eyes", color: "#9aa5b8" };

function stageMeta(id: string): { label: string; region: string; color: string } {
  if (id === "reading") return READING;
  const s = STAGES.find((st) => st.id === id);
  return s ? { label: s.label, region: s.region, color: s.color } : { label: id, region: "", color: "#9aa5b8" };
}

export class Timeline {
  private record: ThoughtRecord | null = null;

  constructor(
    private readonly onPause: () => void,
  ) {}

  /** Build the rows for a new problem's record. */
  show(record: ThoughtRecord): void {
    this.record = record;
    const el = byId("timeline");
    el.innerHTML = "";
    const rows = [READING, ...record.stages.map((s) => ({ id: s.id, label: s.label, region: s.region, color: stageMeta(s.id).color }))];
    for (const r of rows) {
      const div = document.createElement("div");
      div.className = "stage-row";
      div.dataset.stage = r.id;
      div.innerHTML = `<span class="stage-dot" style="background:${r.color}"></span>
        <span class="stage-name">${esc(r.label)}</span>
        <span class="stage-region">${esc(r.region)}</span>`;
      div.addEventListener("click", () => {
        this.highlight(r.id);
        this.showDetail(r.id);
        this.onPause(); // pause the show so the inspection sticks
      });
      el.appendChild(div);
    }
    this.highlight("reading");
    byId("stageDetail").innerHTML = "<em>watch the fly read…</em>";
  }

  /** Highlight a row without changing the detail card. */
  highlight(id: string): void {
    byId("timeline").querySelectorAll(".stage-row").forEach((r) => r.classList.remove("active"));
    byId("timeline").querySelector(`[data-stage="${id}"]`)?.classList.add("active");
  }

  showDetail(id: string): void {
    const detail = byId("stageDetail");
    if (id === "reading") {
      const src = this.record?.source;
      if (!src) {
        detail.innerHTML = `<b>Reading.</b> The optic lobe scans the page — tokenizing quantities and keywords.`;
        return;
      }
      const pct = Math.round(src.confidence * 100);
      const flags = src.flags.length
        ? `<br><span class="muted">Check these numbers: ${esc(src.flags.join(", "))}</span>`
        : "";
      const repairs = src.repairs.length ? `<br><span class="muted">Repaired: ${esc(src.repairs.join(", "))}</span>` : "";
      detail.innerHTML =
        `<b>Reading a picture.</b> ${esc(src.fileName)} was read at ${pct}% confidence.` +
        `<br><span class="muted">${esc(src.transcript.slice(0, 400))}${src.transcript.length > 400 ? "…" : ""}</span>` +
        flags + repairs;
      return;
    }
    const s = this.record?.stages.find((st) => st.id === id);
    if (!s) return;
    const meta = stageMeta(id);
    detail.innerHTML = `<b>${esc(s.label)}</b> <span class="stage-accent" style="color:${meta.color}">· ${esc(s.region)}</span><br>${esc(s.summary)}<br>${s.details.map((d) => `· ${esc(d)}`).join("<br>")}`;
  }
}
