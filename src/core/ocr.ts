/**
 * Reading a picture of a problem.
 *
 * Everything here is lazy and optional. tesseract.js is imported dynamically
 * the first time somebody actually pastes an image, and it is pointed at the
 * assets vendored by `npm run ocr:assets` so the app works offline; if those
 * are missing it falls back to tesseract.js's own CDN. If the engine cannot
 * load at all, the caller gets a clear failure and the typed-input path is
 * untouched.
 *
 * OCR reads PRINTED text. It will not read your handwriting, and it will
 * occasionally misread a digit — which is why the caller always shows the
 * transcript and lets you correct it before the fly works.
 */
import { normalizeMath } from "./normalize";

export interface OcrResult {
  /** what the engine read, after the math normalizer */
  text: string;
  /** 0–1 mean word confidence */
  confidence: number;
  /** words containing numbers the engine was unsure about — check these */
  flags: string[];
  /** which repairs the normalizer made */
  repairs: string[];
  /** data URL of the preprocessed image, for the thumbnail */
  preview: string;
}

export interface OcrProgress {
  stage: string;
  /** 0–1 */
  progress: number;
}

export class OcrUnavailableError extends Error {}

interface Manifest {
  files: string[];
  lang: "local" | "cdn";
  gzip: boolean;
  /** exact core file the app should pin to, e.g. "tesseract-core-simd-lstm.wasm.js" */
  core?: string;
}

let manifestPromise: Promise<Manifest | null> | null = null;

/** What `npm run ocr:assets` left behind, if anything. */
function readManifest(): Promise<Manifest | null> {
  if (!manifestPromise) {
    manifestPromise = fetch(`${import.meta.env.BASE_URL}ocr/manifest.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
      .catch(() => null);
  }
  return manifestPromise;
}

/**
 * Upscale, greyscale and threshold an image before OCR. Tesseract wants dark
 * text on a light background at a decent size; a phone photo of a worksheet
 * gives it neither.
 */
export async function preprocess(file: Blob, maxEdge = 2000): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  // grayscale + Otsu threshold in one pass
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    d[i] = d[i + 1] = d[i + 2] = g;
    hist[Math.round(g)]++;
  }
  const total = w * h;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const between = wB * wF * ((sum / total - sumB / wB) ** 2);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] > threshold ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) throw new OcrUnavailableError("Could not prepare the picture.");
  return blob;
}

/** A small data URL of the preprocessed image, for the confirmation card. */
export async function preview(file: Blob): Promise<string> {
  const prepared = await preprocess(file, 900);
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(String(reader.result));
    reader.onerror = () => rej(new OcrUnavailableError("Could not preview the picture."));
    reader.readAsDataURL(prepared);
  });
}

type TesseractWorker = {
  recognize: (image: Blob) => Promise<{ data: { text: string; confidence: number; words?: Array<{ text: string; confidence: number }> } }>;
  terminate: () => Promise<unknown>;
};

let workerPromise: Promise<TesseractWorker> | null = null;

async function getWorker(onProgress?: (p: OcrProgress) => void): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      onProgress?.({ stage: "loading the reading engine", progress: 0.02 });
      let createWorker: (lang: string, oem: number, opts: Record<string, unknown>) => Promise<TesseractWorker>;
      try {
        ({ createWorker } = await import("tesseract.js"));
      } catch {
        throw new OcrUnavailableError(
          "The reading engine did not load. Type the question instead, or run `npm run ocr:assets` to bundle it offline.",
        );
      }
      const logger = (m: { status?: string; progress?: number }) =>
        onProgress?.({ stage: m.status ?? "reading", progress: 0.1 + 0.85 * (m.progress ?? 0) });
      const manifest = await readManifest();
      const base = `${import.meta.env.BASE_URL}ocr`;

      if (manifest?.lang === "local") {
        const opts: Record<string, unknown> = {
          logger,
          workerPath: `${base}/worker.min.js`,
          // a corePath ending in "js" is loaded verbatim — that pins ONE core
          // build instead of guessing between the simd and relaxed-simd ones
          // (and failing when only one of them was vendored)
          corePath: `${base}/core/${manifest.core ?? "tesseract-core-simd-lstm.wasm.js"}`,
          langPath: `${base}/lang`,
          gzip: manifest.gzip,
        };
        try {
          // oem 1 = LSTM only, which is the core we vendored
          return await createWorker("eng", 1, opts);
        } catch (err) {
          console.warn("[ocr] local engine failed, falling back to the CDN", err);
        }
      }
      // no vendored assets, or a browser without SIMD: let tesseract.js fetch
      // its own build
      return createWorker("eng", 1, { logger });
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

/** Free the worker (the desk view calls this when the tab is hidden). */
export async function releaseOcr(): Promise<void> {
  const p = workerPromise;
  workerPromise = null;
  if (p) await (await p).terminate().catch(() => undefined);
}

/** Words the engine was unsure about that contain numbers — check these. */
function flagNumbers(words: Array<{ text: string; confidence: number }>): string[] {
  return words
    .filter((w) => /\d/.test(w.text) && w.confidence < 80)
    .map((w) => w.text.trim())
    .filter(Boolean)
    .slice(0, 8);
}

/**
 * Read a picture of a problem. The transcript is always returned for the human
 * to confirm — the fly never guesses at its own handwriting.
 */
export async function readImage(
  file: Blob,
  onProgress?: (p: OcrProgress) => void,
): Promise<OcrResult> {
  const worker = await getWorker(onProgress);
  onProgress?.({ stage: "sharpening the page", progress: 0.08 });
  const prepared = await preprocess(file);
  const thumbnail = await preview(file);
  onProgress?.({ stage: "reading the page", progress: 0.2 });
  const { data } = await worker.recognize(prepared);
  onProgress?.({ stage: "reading the page", progress: 0.99 });

  const { text, applied } = normalizeMath(data.text, { ocr: true });
  const confidence = Math.max(0, Math.min(1, (data.confidence ?? 0) / 100));
  return {
    text,
    confidence,
    flags: data.words ? flagNumbers(data.words) : [],
    repairs: applied,
    preview: thumbnail,
  };
}

/** Whether the app can currently read pictures, for the UI to disable itself. */
export async function ocrAvailable(): Promise<boolean> {
  const manifest = await readManifest();
  return manifest?.lang === "local";
}
