/**
 * The Hive panel — what the crowd has taught the fly, and exactly what this
 * device is about to share.
 *
 * Two renderers are exported as pure functions and everything else is a thin
 * DOM wrapper, because this project tests in a node env with no jsdom: the
 * HTML has to be assertable without a document.
 *
 * The queue listing is deliberately verbatim. Sharing is on by default here,
 * and "on by default" is only fair if a visitor can read exactly what is
 * leaving their machine before it does.
 */
import { KEYWORDS, TOPIC_LIST, unitFamilyName } from "../core/features";
import type { HiveEntry } from "../core/corpus";
import { corpusStats, toCorpus, type CorpusStats } from "../core/corpus";
import { byId, esc, describeError } from "./dom";
import type { SyncState } from "../core/sync";

const VERDICT_NOTE: Record<HiveEntry["verdict"], string> = {
  right: "confirmed right",
  wrong: "marked wrong",
  taught: "corrected by a human",
};

/** Unit families present in a shareable entry, as words. */
export function entryUnits(entry: HiveEntry): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < entry.units.length; i += 2) {
    const name = unitFamilyName(entry.units[i]);
    const count = entry.units[i + 1];
    out.push(count === 1 ? name : `${name}×${count}`);
  }
  return out;
}

/** Keyword stems that fired, as words. */
export function entryKeywords(entry: HiveEntry): string[] {
  return entry.keywords.map((k) => KEYWORDS[k] ?? `#${k}`);
}

/**
 * The exact teaches queued for sharing, newest last. Escaped throughout:
 * this text came from a stranger's file as readily as from a textarea.
 */
export function renderHiveQueue(entries: readonly HiveEntry[], limit = 10): string {
  if (entries.length === 0) {
    return `<p class="muted small">Nothing taught yet. Ask the fly a question, then tell it whether it was right, or what the problem was.</p>`;
  }
  const recent = entries.slice(-limit).reverse();
  const rows = recent
    .map((e) => {
      const units = entryUnits(e);
      const words = entryKeywords(e);
      const signals = [
        units.length ? `units: ${units.map(esc).join(", ")}` : "",
        words.length ? `words: ${words.map(esc).join(", ")}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      const votes = e.votes > 1 ? ` · ${e.votes}× taught` : "";
      return (
        `<li class="hive-row">` +
        `<span class="hive-topic">${esc(e.topic)}</span>` +
        `<span class="hive-text">${esc(e.text || "(empty phrasing)")}</span>` +
        `<span class="hive-signal">${VERDICT_NOTE[e.verdict] ?? e.verdict}${votes}${signals ? `: ${signals}` : ""}</span>` +
        `</li>`
      );
    })
    .join("");
  const more =
    entries.length > limit ? `<p class="muted small">…and ${entries.length - limit} earlier teaches.</p>` : "";
  return `<ul class="hive-queue">${rows}</ul>${more}`;
}

/** Per-topic horizontal bars, scaled to the busiest topic. */
export function renderHiveTopics(stats: CorpusStats): string {
  const peak = Math.max(1, ...TOPIC_LIST.map((t) => stats.perTopic[t]));
  const rows = TOPIC_LIST.map((topic) => {
    const n = stats.perTopic[topic];
    const pct = Math.round((n / peak) * 100);
    return (
      `<div class="hive-bar-row">` +
      `<span class="hive-bar-name">${esc(topic)}</span>` +
      `<span class="hive-bar"><span class="hive-bar-fill" style="width:${pct}%"></span></span>` +
      `<span class="hive-bar-n">${n}</span>` +
      `</div>`
    );
  }).join("");
  return `<div class="hive-bars">${rows}</div>`;
}

/** One plain sentence about what is and isn't being shared. */
export function renderHiveNotice(stats: CorpusStats, status: SyncState, persistent: boolean): string {
  const share = stats.entries
    ? `${stats.entries} ${stats.entries === 1 ? "teach" : "teaches"} from this device${stats.votes > stats.entries ? ` (${stats.votes} ${stats.votes === 1 ? "vote" : "votes"})` : ""}`
    : "no teaches yet";
  const memory = persistent ? "Saved on this device, so a reload keeps them." : "This browser is blocking local storage, so these will be lost on reload.";
  if (status.status === "off") {
    return `${share}. ${memory} No hive endpoint is configured, so nothing is being uploaded. Set VITE_HIVE_ENDPOINT to go live.`;
  }
  return `${share}. ${memory} ${status.message}`;
}

export interface HiveViewOptions {
  /** the current merged corpus */
  entries: () => readonly HiveEntry[];
  sync: () => Promise<void>;
  exportCorpus: () => void;
  importCorpus: (text: string) => void;
  forget: () => void;
  persistent: () => boolean;
  status: () => SyncState;
}

export function initHiveView(opts: HiveViewOptions): { refresh: () => void } {
  const refresh = (): void => {
    const entries = opts.entries();
    const stats = corpusStats(entries);
    byId("hiveCount").textContent = `${stats.entries} shared · ${stats.votes} ${stats.votes === 1 ? "vote" : "votes"}`;
    byId("hiveStatus").textContent = renderHiveNotice(stats, opts.status(), opts.persistent());
    byId("hiveTopics").innerHTML = renderHiveTopics(stats);
    byId("hiveQueue").innerHTML = renderHiveQueue(entries);
  };

  byId("hiveSync").addEventListener("click", () => {
    const btn = byId("hiveSync") as HTMLButtonElement;
    btn.disabled = true;
    void opts
      .sync()
      .catch((err: unknown) => console.warn("[hive] sync failed", describeError(err), err))
      .finally(() => {
        btn.disabled = false;
        refresh();
      });
  });

  byId("hiveExport").addEventListener("click", () => {
    try {
      opts.exportCorpus();
    } catch (err) {
      console.warn("[hive] export failed", describeError(err), err);
      byId("hiveStatus").textContent = "Could not build the export file.";
    }
  });

  const file = byId("hiveFile") as HTMLInputElement;
  file.addEventListener("change", () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    chosen
      .text()
      .then((text) => {
        opts.importCorpus(text);
        refresh();
      })
      .catch((err: unknown) => console.warn("[hive] import failed", describeError(err), err))
      .finally(() => {
        file.value = "";
      });
  });

  byId("hiveForget").addEventListener("click", () => {
    opts.forget();
    refresh();
  });

  refresh();
  return { refresh };
}

/** Pretty JSON for the export file, so a human can read what they are sharing. */
export function corpusFileText(entries: readonly HiveEntry[]): string {
  return JSON.stringify(toCorpus(entries), null, 2);
}
