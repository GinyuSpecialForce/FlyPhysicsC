/**
 * Chart renderers for the training view: the per-epoch accuracy/loss canvas
 * and the eval-bank confusion matrix.
 */
import { TOPIC_LIST } from "../core/features";
import type { ThoughtRecord } from "../core/types";
import { byId, esc } from "./dom";

export function drawAccChart(losses: number[], accs: number[]): void {
  const canvas = byId("accChart") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#202028";
  ctx.fillRect(0, 0, W, H);

  const min = 0;
  const max = 1;
  const n = accs.length;
  const px = (i: number) => 40 + (i / Math.max(1, n - 1)) * (W - 60);
  const py = (v: number) => H - 30 - ((v - min) / (max - min || 1)) * (H - 60);

  // gridlines
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.fillStyle = "#94949e";
  ctx.font = "11px Hack, monospace";
  for (const g of [0, 0.25, 0.5, 0.75, 1]) {
    ctx.beginPath();
    ctx.moveTo(40, py(g));
    ctx.lineTo(W - 20, py(g));
    ctx.stroke();
    ctx.fillText(`${(g * 100).toFixed(0)}%`, 8, py(g) + 4);
  }
  // accuracy line
  ctx.strokeStyle = "#e8e8ee";
  ctx.lineWidth = 2;
  ctx.beginPath();
  accs.forEach((a, i) => (i === 0 ? ctx.moveTo(px(i), py(a)) : ctx.lineTo(px(i), py(a))));
  ctx.stroke();
  // 85% gate line
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(40, py(0.85));
  ctx.lineTo(W - 20, py(0.85));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#94949e";
  ctx.fillText("85% gate", W - 84, py(0.85) - 6);
  // loss line (secondary, scaled)
  if (losses.length) {
    const lMax = Math.max(...losses);
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    losses.forEach((l, i) => {
      const y = H - 30 - (l / (lMax || 1)) * (H - 60);
      i === 0 ? ctx.moveTo(px(i), y) : ctx.lineTo(px(i), y);
    });
    ctx.stroke();
  }
  ctx.fillStyle = "#94949e";
  ctx.fillText("accuracy (solid) · loss (scaled, grey)", 46, 16);
}

export function renderConfusion(records: ThoughtRecord[]): void {
  const el = byId("confusion");
  const mat: Record<string, Record<string, number>> = {};
  for (const t of TOPIC_LIST) mat[t] = {};
  for (const r of records) {
    mat[r.correctTopic][r.predicted] = (mat[r.correctTopic][r.predicted] ?? 0) + 1;
  }
  let html = `<div class="confusion-grid" style="grid-template-columns: 90px repeat(${TOPIC_LIST.length}, 1fr)">`;
  html += `<div class="confusion-cell head"></div>`;
  for (const p of TOPIC_LIST) html += `<div class="confusion-cell head">${esc(p.slice(0, 4))}</div>`;
  for (const a of TOPIC_LIST) {
    html += `<div class="confusion-cell head" style="text-align:right">${esc(a.slice(0, 4))}</div>`;
    for (const p of TOPIC_LIST) {
      const v = mat[a][p] ?? 0;
      const cls = a === p ? (v > 0 ? "hit" : "") : v > 0 ? "miss" : "";
      html += `<div class="confusion-cell ${cls}">${v || "·"}</div>`;
    }
  }
  html += "</div>";
  el.innerHTML = html;
}
