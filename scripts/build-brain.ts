/**
 * Build the brain that ships with the site.
 *
 * This is the "recompile the hive" step. It is deterministic: the same corpus
 * and the same seed always produce the same weights, which is what lets a
 * visitor's fly start byte-identical to everyone else's.
 *
 *   npm run brain:build
 *
 * Run it after merging new shared teaches (npm run hive:merge) and before
 * deploying. Output: public/brain.json.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { trainNetwork, evaluate } from "../src/core/train";
import { buildSnapshot } from "../src/core/serialize";
import { fromCorpus, replayCorpus, corpusStats, toCorpus, type HiveEntry } from "../src/core/corpus";

const SEED = 1337;
const EPOCHS = 6;
const SAMPLES = 600;

const root = resolve(import.meta.dirname, "..");
const hivePath = resolve(root, "public/hive.json");
const brainPath = resolve(root, "public/brain.json");

function readHive(): HiveEntry[] {
  if (!existsSync(hivePath)) {
    console.log("no public/hive.json yet — starting from an empty hive");
    return [];
  }
  const raw = JSON.parse(readFileSync(hivePath, "utf8"));
  const entries = fromCorpus(raw);
  const rejected = Array.isArray(raw?.entries) ? raw.entries.length - entries.length : 0;
  console.log(`read ${entries.length} shared teaches from public/hive.json${rejected ? ` (dropped ${rejected} malformed)` : ""}`);
  return entries;
}

const entries = readHive();

console.log(`training: seed=${SEED} epochs=${EPOCHS} samples/epoch=${SAMPLES}`);
const result = trainNetwork(SEED, EPOCHS, SAMPLES);
const before = evaluate(result.network).accuracy;
console.log(`  synthetic only: ${(before * 100).toFixed(1)}% on the eval bank`);

const steps = replayCorpus(entries, result.network);
const ev = evaluate(result.network);
const stats = corpusStats(entries);
console.log(`  replayed ${steps} shared teaches across ${stats.topicsCovered} topics`);
console.log(`  with the hive:  ${(ev.accuracy * 100).toFixed(1)}% on the eval bank (${ev.correct}/${ev.total})`);

const snapshot = buildSnapshot({
  network: result.network,
  seed: SEED,
  epochs: EPOCHS,
  samples: SAMPLES,
  evalAccuracy: ev.accuracy,
  entries,
});
writeFileSync(brainPath, `${JSON.stringify(snapshot, null, 2)}\n`);
const kb = (JSON.stringify(snapshot).length / 1024).toFixed(1);
console.log(`wrote public/brain.json (${kb} KB, ${snapshot.bakedKeys.length} baked teach keys)`);

// keep the shipped corpus normalised too, so a rebuild is a no-op diff
writeFileSync(hivePath, `${JSON.stringify(toCorpus(entries), null, 2)}\n`);
console.log("wrote public/hive.json");
