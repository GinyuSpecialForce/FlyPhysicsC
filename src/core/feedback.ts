/**
 * Feedback memory — what the HUMAN teaches the fly. Two mechanisms work
 * together, mirroring the innate/learned split used everywhere else here:
 *
 *   1. an episodic memory: a phrasing similar to a taught one RECALLS the
 *      confirmed topic at classification time — the human's verdict is
 *      authoritative for problems it recognizes;
 *   2. callers pair this with an SGD step on the mushroom-body network
 *      (FlyBrain.learn), so unseen-but-similar phrasings drift the same way.
 */
import type { Topic } from "./features";

interface Entry {
  words: Set<string>;
  topic: Topic;
  text: string;
  key: string;
}

/** Words too common to identify a problem; keep the physics vocabulary. */
const STOPWORDS = new Set([
  "a", "an", "the", "of", "is", "it", "its", "in", "on", "at", "to", "and", "or",
  "what", "how", "much", "many", "does", "do", "find", "determine", "for", "with",
  "by", "from", "are", "was", "were", "if", "ignoring", "that", "this", "be",
  "as", "his", "her", "their", "you", "we", "they",
]);

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9. ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOPWORDS.has(w)),
  );
}

function canonicalWordsKey(wordSet: Set<string>): string {
  return [...wordSet].sort().join(" ");
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter || 1);
}

/** Word-overlap needed before a memory counts as "the same kind of problem". */
export const SIMILARITY_THRESHOLD = 0.45;

export class FeedbackMemory {
  private entries: Entry[] = [];

  /**
   * Remember that `text` should be handled as `topic`.
   * If an entry with the exact same normalized word-bag already exists, update
   * its topic in place rather than stacking duplicate entries that skew votes.
   */
  record(text: string, topic: Topic): void {
    const w = words(text);
    if (w.size === 0) return;
    const key = canonicalWordsKey(w);
    const existing = this.entries.find((e) => e.key === key);
    if (existing) {
      existing.topic = topic;
      existing.text = text;
      return;
    }
    this.entries.push({ words: w, topic, text, key });
  }

  get size(): number {
    return this.entries.length;
  }

  /** The topic a similar phrasing was taught, or null when nothing matches. */
  lookup(text: string): Topic | null {
    const w = words(text);
    const votes = new Map<Topic, number>();
    for (const e of this.entries) {
      const sim = jaccard(w, e.words);
      if (sim >= SIMILARITY_THRESHOLD) {
        votes.set(e.topic, (votes.get(e.topic) ?? 0) + sim);
      }
    }
    let best: Topic | null = null;
    let bestScore = 0;
    for (const [topic, score] of votes) {
      if (score > bestScore) {
        best = topic;
        bestScore = score;
      }
    }
    return best;
  }
}
