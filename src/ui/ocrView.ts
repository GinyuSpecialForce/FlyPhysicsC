/**
 * Image intake for the free-form box.
 *
 * A photograph of a problem can arrive three ways — pasted from the
 * clipboard, dropped on the box, or picked from a file — and all three end up
 * in the same place: the transcript goes into the existing textarea, where it
 * can be corrected before the fly works on it. The fly never reads a picture
 * straight into an answer; a human always sees what it read first.
 */
import { readImage, releaseOcr } from "../core/ocr";
import type { OcrResult } from "../core/ocr";
import type { ProblemSource } from "../core/types";
import { byId, describeError, esc } from "./dom";

/** Below this, the fly says so rather than pretending it read the page. */
export const CONFIDENT = 0.8;

export interface OcrViewOptions {
  /** hand the finished transcript to the brain */
  onSolve: (text: string, source: ProblemSource, confident: boolean) => void;
}

/** Build the source record the thought timeline shows. */
export function toSource(fileName: string, result: OcrResult): ProblemSource {
  return {
    kind: "image",
    fileName,
    confidence: result.confidence,
    transcript: result.text,
    flags: result.flags,
    repairs: result.repairs,
  };
}

function status(text: string, kind: "info" | "warn" | "bad" = "info"): void {
  const el = byId("ocrStatus");
  el.textContent = text;
  el.className = `ocr-status ${kind}${text ? "" : " hidden"}`;
}

/** Wire the button, the drop target and the clipboard. */
export function initOcrView(opts: OcrViewOptions): void {
  const box = byId("freeformBox");
  const input = byId("freeformInput") as HTMLTextAreaElement;
  const file = byId("ocrFile") as HTMLInputElement;
  const card = byId("ocrCard");

  const showResult = (result: OcrResult, fileName: string): void => {
    input.value = result.text;
    const confident = result.confidence >= CONFIDENT;
    const pct = Math.round(result.confidence * 100);
    const flags = result.flags.length
      ? `<div class="ocr-flags"><b>Check these numbers:</b> ${result.flags.map((f) => esc(f)).join(", ")}</div>`
      : "";
    const repairs = result.repairs.length
      ? `<div class="ocr-repairs">Repaired: ${result.repairs.map((r) => esc(r)).join(", ")}</div>`
      : "";
    card.innerHTML = `
      <img class="ocr-thumb" src="${result.preview}" alt="the picture the fly read" />
      <div class="ocr-card-body">
        <div class="ocr-confidence ${confident ? "good" : "warn"}">
          Read at ${pct}% confidence: ${confident ? "that looks clean" : "please check the reading"}
        </div>
        ${flags}${repairs}
        <div class="ocr-cta">Correct it above if needed, then give it to the fly.</div>
      </div>`;
    card.classList.remove("hidden");
    status("");
    opts.onSolve(result.text, toSource(fileName, result), confident);
  };

  const read = async (blob: Blob, fileName: string): Promise<void> => {
    card.classList.add("hidden");
    status("reading the page…");
    try {
      const result = await readImage(blob, (p) =>
        status(`${p.stage}: ${Math.round(p.progress * 100)}%`),
      );
      showResult(result, fileName);
    } catch (err) {
      // the engine can reject with a string, a cross-realm Error or a plain
      // object — show whatever reason it actually gave rather than a shrug
      status(describeError(err).slice(0, 300), "bad");
      console.warn("[ocr]", err);
    }
  };

  const handleFile = (f: File | undefined | null): void => {
    if (!f || !f.type.startsWith("image/")) {
      status("That file is not a picture the fly can read.", "warn");
      return;
    }
    void read(f, f.name || "pasted image");
  };

  byId("ocrPick").addEventListener("click", () => file.click());
  file.addEventListener("change", () => {
    handleFile(file.files?.[0]);
    file.value = "";
  });

  // paste a screenshot straight into the box
  input.addEventListener("paste", (e) => {
    const items = (e.clipboardData ?? null)?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        e.preventDefault();
        handleFile(item.getAsFile());
        return;
      }
    }
  });

  // …or drop one on it
  for (const type of ["dragenter", "dragover"]) {
    box.addEventListener(type, (e) => {
      e.preventDefault();
      box.classList.add("dropping");
    });
  }
  for (const type of ["dragleave", "drop"]) {
    box.addEventListener(type, (e) => {
      e.preventDefault();
      box.classList.remove("dropping");
    });
  }
  box.addEventListener("drop", (e) => {
    handleFile(e.dataTransfer?.files?.[0]);
  });

  window.addEventListener("beforeunload", () => {
    void releaseOcr();
  });
}
