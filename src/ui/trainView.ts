/**
 * Training playground: trains ONE network incrementally across animation
 * frames (the same chunked TrainState path boot() uses), draws the live curve
 * after each epoch, and hands the trained network back to the app to hot-swap
 * onto the desk fly.
 */
import { trainNetwork, evaluate, type TrainState } from "../core/train";
import type { Network } from "../core/network";
import type { HiveEntry } from "../core/corpus";
import { TOPIC_LIST } from "../core/features";
import { drawAccChart, renderConfusion } from "./charts";
import { byId, input } from "./dom";

export function initTrainView(
  onTrained: (network: Network) => void,
  getHiveEntries?: () => readonly HiveEntry[],
): void {
  byId("trainBtn").addEventListener("click", () => {
    const seed = parseInt(input("seedInput").value, 10) || 1337;
    const epochs = Math.max(1, parseInt(input("epochInput").value, 10) || 6);
    const samples = Math.max(60, parseInt(input("samplesInput").value, 10) || 600);
    void runTraining(seed, epochs, samples, onTrained, getHiveEntries?.());
  });
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

async function runTraining(
  seed: number,
  epochs: number,
  samples: number,
  onTrained: (network: Network) => void,
  hiveEntries?: readonly HiveEntry[],
): Promise<void> {
  const btn = byId("trainBtn") as HTMLButtonElement;
  btn.disabled = true;
  const log = byId("trainLog");
  log.textContent = `seed=${seed} epochs=${epochs} samples/epoch=${samples}\ntraining…`;
  const losses: number[] = [];
  const accs: number[] = [];

  try {
    let state: TrainState | undefined;
    let network!: Network;
    for (let i = 0; i < epochs; i++) {
      await nextFrame();
      const step = trainNetwork(seed, 1, samples, { state, hiveEntries });
      state = step.state;
      network = step.network;
      losses.push(step.losses[0]);
      accs.push(step.finalEvalAccuracy);
      drawAccChart(losses, accs);
      log.textContent =
        `seed=${seed} epochs=${epochs} samples/epoch=${samples}\n` +
        `epoch ${i + 1}/${epochs}: loss ${step.losses[0].toFixed(3)} · eval ${(step.finalEvalAccuracy * 100).toFixed(1)}%`;
    }

    const ev = evaluate(network);
    const badge = byId("finalAcc");
    badge.textContent = `${(ev.accuracy * 100).toFixed(1)}% eval`;
    badge.className = `badge ${ev.accuracy >= 0.85 ? "good" : "bad"}`;
    renderConfusion(ev.records);
    log.textContent =
      `seed=${seed} epochs=${epochs} samples/epoch=${samples}\n` +
      `final eval: ${ev.correct}/${ev.total} = ${(ev.accuracy * 100).toFixed(1)}%\n` +
      `epoch accuracies: ${accs.map((a) => (a * 100).toFixed(0)).join("%, ")}%\n` +
      `mean loss: ${losses.map((l) => l.toFixed(3)).join(" → ")}\n` +
      `\nper-topic: ${TOPIC_LIST.map((t) => `${t} ${ev.perTopic[t].correct}/${ev.perTopic[t].total}`).join(", ")}`;
    onTrained(network);
  } finally {
    btn.disabled = false;
  }
}
