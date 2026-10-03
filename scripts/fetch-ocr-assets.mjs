/**
 * Vendor the OCR engine's assets into public/ocr so the fly can read a
 * screenshot with no network and no CDN.
 *
 *   npm run ocr:assets
 *
 * Copies the worker and the SIMD wasm core out of node_modules, then fetches
 * the English model once (it is not published in the npm package). Writes
 * public/ocr/manifest.json, which is what the app checks before choosing local
 * paths; without it the app falls back to tesseract.js's CDN defaults.
 *
 * Total: about 8 MB, and nothing is loaded until a picture is actually pasted.
 * The "fast" English model is used on purpose: the app upscales and
 * thresholds the image first, and the fast model reads clean printed text
 * about as well at a fraction of the size.
 */
import { createWriteStream, existsSync, mkdirSync, statSync, copyFileSync } from "node:fs";
import { get } from "node:https";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "public/ocr");

/**
 * ONE core build, pinned by name. tesseract.js would otherwise feature-detect
 * and ask for the relaxed-simd or plain build, which we have not vendored —
 * pointing `corePath` at this exact file (it ends in "js") pins it.
 *
 * SIMD has been baseline in every current browser (Chrome 91, Firefox 89,
 * Safari 16.4); if it is missing, the app falls back to tesseract.js's CDN.
 */
const CORE = "tesseract-core-simd-lstm";
const CORE_FILES = [`${CORE}.wasm.js`, `${CORE}.wasm`];
const LANG_URLS = [
  "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata",
  "https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz",
];

function download(url, dest) {
  return new Promise((res, rej) => {
    get(url, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        r.resume();
        download(r.headers.location, dest).then(res, rej);
        return;
      }
      if (r.statusCode !== 200) {
        r.resume();
        rej(new Error(`${url} → HTTP ${r.statusCode}`));
        return;
      }
      pipeline(Readable.from(r), createWriteStream(dest)).then(() => res(), rej);
    }).on("error", rej);
  });
}

async function main() {
  mkdirSync(resolve(out, "core"), { recursive: true });
  mkdirSync(resolve(out, "lang"), { recursive: true });

  const workerSrc = resolve(root, "node_modules/tesseract.js/dist/worker.min.js");
  if (!existsSync(workerSrc)) throw new Error("tesseract.js is not installed — run `npm install` first");
  copyFileSync(workerSrc, resolve(out, "worker.min.js"));
  console.log("✓ worker.min.js");

  for (const file of CORE_FILES) {
    const src = resolve(root, "node_modules/tesseract.js-core", file);
    if (!existsSync(src)) {
      console.log(`· skipped ${file} (not in this build of tesseract.js-core)`);
      continue;
    }
    copyFileSync(src, resolve(out, "core", file));
    console.log(`✓ core/${file}`);
  }

  const langDest = resolve(out, "lang/eng.traineddata");
  const langDestGz = resolve(out, "lang/eng.traineddata.gz");
  let langOk = existsSync(langDest);
  let langGzip = false;
  if (!langOk && existsSync(langDestGz)) {
    langOk = true;
    langGzip = true;
  }
  if (!langOk) {
    for (const url of LANG_URLS) {
      try {
        console.log(`↓ ${url}`);
        langGzip = url.endsWith(".gz");
        await download(url, langGzip ? langDestGz : langDest);
        langOk = true;
        break;
      } catch (err) {
        console.warn(`  failed: ${err.message}`);
      }
    }
  }
  const langPath = langGzip ? langDestGz : langDest;
  if (langOk) {
    console.log(`✓ lang/${langPath.split("/").pop()} (${(statSync(langPath).size / 1e6).toFixed(1)} MB)`);
  } else {
    console.warn("! could not fetch the English model — the app will use the CDN instead");
  }

  const files = [
    "worker.min.js",
    ...CORE_FILES.map((f) => `core/${f}`),
    ...(langOk ? [`lang/${langPath.split("/").pop()}`] : []),
  ].filter((f) => existsSync(resolve(out, f)));
  createWriteStream(resolve(out, "manifest.json"), { flags: "w" }).end(
    JSON.stringify({ files, lang: langOk ? "local" : "cdn", gzip: langGzip, core: `${CORE}.wasm.js` }, null, 2),
  );
  console.log(`\nDone. ${files.length} files in public/ocr — the fly can now read pictures offline.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
