/**
 * Training playground: trains ONE real network incrementally (the boot path
 * now shares this honest path), draws the live curve, and hands the trained
 * network back to the app to hot-swap onto the desk fly.
 */
import { trainNetwork, evaluate } from "../core/train";
import type { Network } from "../core/network";
import { TOPIC_LIST } from "../core/features";
import { drawAccChart, renderConfusion } from "./charts";
import { byId, input } from "./dom";

export function initTrainView(onTrained: (network: Network) => void): void {
  byId("trainBtn").addEventListener("click", () => {
    const seed = parseInt(input("seedInput").value, 10) || 1337;
    const epochs = Math.max(1, parseInt(input("epochInput").value, 10) || 6);
    const samples = Math.max(60, parseInt(input("samplesInput").value, 10) || 600);
    runTraining(seed, epochs, samples, onTrained);
  });
}

function runTraining(seed: number, epochs: number, samples: number, onTrained: (network: Network) => void): void {
  const log = byId("trainLog");
  log.textContent = `seed=${seed} epochs=${epochs} samples/epoch=${samples}\ntraining…`;
  const losses: number[] = [];
  const accs: number[] = [];

  // a browser-friendly beat between epochs so the chart animates
  let epoch = 0;
  const result = trainNetwork(seed, epochs, samples, {
    onEpoch: (i, loss, acc) => {
      epoch = i;
      losses.push(loss);
      accs.push(acc);
    },
  });
  void epoch;

  // trainNetwork runs synchronously; render the full curve, then log
  requestAnimationFrame(() => {
    drawAccChart(losses, accs);
    const ev = evaluate(result.network);
    const badge = byId("finalAcc");
    badge.textContent = `${(ev.accuracy * 100).toFixed(1)}% eval`;
    badge.className = `badge ${ev.accuracy >= 0.85 ? "good" : "bad"}`;
    renderConfusion(ev.records);
    log.textContent =
      `seed=${seed} epochs=${epochs} samples/epoch=${samples}\n` +
      `final eval: ${ev.correct}/${ev.total} = ${(ev.accuracy * 100).toFixed(1)}%\n` +
      `epoch accuracies: ${result.evalAccuracies.map((a) => (a * 100).toFixed(0)).join("%, ")}%\n` +
      `mean loss: ${result.losses.map((l) => l.toFixed(3)).join(" → ")}\n` +
      `\nper-topic: ${TOPIC_LIST.map((t) => `${t} ${ev.perTopic[t].correct}/${ev.perTopic[t].total}`).join(", ")}`;
    onTrained(result.network);
  });
}
