/**
 * Merge contributed hive files into the corpus that ships with the site.
 *
 * This is the "collect the crowd" step, and it is deliberately a file
 * operation rather than a database: drop every contributed hive-*.json into
 * corpus/inbox/ and run
 *
 *   npm run hive:merge
 *
 * The merge is a union with vote counting (see core/corpus.ts), so it is
 * order-independent, idempotent, and never loses a teach — running it twice
 * produces the same file, and merging the same contribution from ten people
 * counts as ten votes.
 *
 * Then run `npm run brain:build` to fold the new teaches into the shipped
 * brain, and deploy.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { fromCorpus, mergeCorpora, toCorpus, corpusStats, type HiveEntry } from "../src/core/corpus";

const root = resolve(import.meta.dirname, "..");
const inbox = resolve(root, "corpus/inbox");
const hivePath = resolve(root, "public/hive.json");

if (!existsSync(inbox)) {
  mkdirSync(inbox, { recursive: true });
  console.log(`created ${inbox}/ — drop contributed hive-*.json files there, then re-run`);
}

const existing: HiveEntry[] = existsSync(hivePath)
  ? fromCorpus(JSON.parse(readFileSync(hivePath, "utf8")))
  : [];

const files = existsSync(inbox)
  ? readdirSync(inbox).filter((f) => f.endsWith(".json")).sort()
  : [];

if (files.length === 0) {
  const stats = corpusStats(existing);
  console.log(`no contributions in corpus/inbox/ — hive still holds ${stats.entries} teaches (${stats.votes} votes)`);
  process.exit(0);
}

console.log(`merging ${files.length} contribution file(s) into a hive of ${existing.length} teaches:`);
let contributed: HiveEntry[] = [];
for (const file of files) {
  let entries: HiveEntry[];
  try {
    entries = fromCorpus(JSON.parse(readFileSync(join(inbox, file), "utf8")));
  } catch (err) {
    console.log(`  skip ${file}: unreadable (${err instanceof Error ? err.message : "not JSON"})`);
    continue;
  }
  const fresh = entries.filter((e) => !existing.some((h) => h.text === e.text && h.topic === e.topic));
  contributed = mergeCorpora(contributed, entries);
  console.log(`  ${file}: ${entries.length} teaches (${fresh.length} new)`);
}

const merged = mergeCorpora(existing, contributed);
const before = corpusStats(existing);
const after = corpusStats(merged);
writeFileSync(hivePath, `${JSON.stringify(toCorpus(merged), null, 2)}\n`);

console.log(`\n${before.entries} → ${after.entries} teaches, ${before.votes} → ${after.votes} votes`);
console.log(`topics touched: ${after.topicsCovered}/12`);
const weakest = Object.entries(after.perTopic)
  .filter(([, n]) => n === 0)
  .map(([t]) => t);
if (weakest.length) console.log(`nothing shared yet for: ${weakest.join(", ")}`);

const size = (JSON.stringify(toCorpus(merged)).length / 1024).toFixed(1);
console.log(`\nwrote public/hive.json (${size} KB)`);
console.log("next: npm run brain:build, then deploy");
