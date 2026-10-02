/**
 * Lesion lab: one card per lesion, driven entirely by the LESIONS registry.
 * Selecting a card shows the per-topic breakdown and applies that lesion to
 * the desk fly — one source of truth, so the desk can never disagree with
 * the lab about what a lesion does.
 */
import { evaluateAllLesions } from "../core/train";
import type { EvalResult } from "../core/train";
import { LESIONS, lesionInfo } from "../core/lesions";
import type { LesionType } from "../core/lesions";
import type { Network } from "../core/network";
import { TOPIC_LIST } from "../core/features";
import { byId, esc } from "./dom";

let evals: Record<LesionType, EvalResult> | null = null;

export function initLesionView(
  getNetwork: () => Network,
  onLesionSelected: (type: LesionType) => void,
): void {
  computeEvals(getNetwork());
  renderCards(onLesionSelected);
  const first = LESIONS[0];
  selectCard(first.type, onLesionSelected);
}

function computeEvals(network: Network): void {
  evals = evaluateAllLesions(network);
}

function renderCards(onLesionSelected: (type: LesionType) => void): void {
  const grid = byId("lesionResults");
  grid.innerHTML = "";
  for (const info of LESIONS) {
    const r = evals![info.type];
    const card = document.createElement("div");
    card.className = "lesion-card";
    card.dataset.type = info.type;
    card.title = info.summary;
    const pct = (r.accuracy * 100).toFixed(0);
    card.innerHTML = `<div class="lbl">${esc(info.label)}</div>
      <div class="pct ${info.cardTone}">${pct}%</div>
      <div class="lesion-bar"><div class="${info.cardTone}" style="width:${pct}%"></div></div>
      <div class="summary">${esc(info.summary)}</div>`;
    card.addEventListener("click", () => selectCard(info.type, onLesionSelected));
    grid.appendChild(card);
  }
}

function selectCard(type: LesionType, onLesionSelected: (type: LesionType) => void): void {
  document.querySelectorAll(".lesion-card").forEach((c) => c.classList.toggle("selected", (c as HTMLElement).dataset.type === type));
  if (evals) showLesionTopics(evals[type]);
  onLesionSelected(type);
}

function showLesionTopics(r: EvalResult): void {
  const el = byId("lesionTopics");
  el.innerHTML = TOPIC_LIST.map((t) => {
    const p = r.perTopic[t];
    const pct = p.total ? Math.round((p.correct / p.total) * 100) : 0;
    const tone = pct >= 80 ? "good" : pct >= 40 ? "warn" : "bad";
    return `<div class="topic-row">
      <span class="topic-name">${esc(t)}</span>
      <div class="topic-bar"><div class="${tone}" style="width:${pct}%"></div></div>
      <span class="topic-pct">${pct}%</span>
    </div>`;
  }).join("");
}

/** Re-run the lab numbers after the desk trained a new network. */
export function refreshLesionEvals(network: Network, onLesionSelected: (type: LesionType) => void): void {
  computeEvals(network);
  renderCards(onLesionSelected);
  const selected = document.querySelector(".lesion-card.selected") as HTMLElement | null;
  const type = (selected?.dataset.type as LesionType | undefined) ?? "none";
  document.querySelector(`.lesion-card[data-type="${type}"]`)?.classList.add("selected");
  if (evals) showLesionTopics(evals[type]);
}

export function lesionSummary(type: LesionType): string {
  return lesionInfo(type).summary;
}
