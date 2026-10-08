<div align="center">

# Fly Physics C

**A virtual fly brain that learned AP Physics C. Watch it think, in 3D.**

A fly sits at a desk, waiting for you to hand it a question. Above it
floats a holographic brain:
its optic lobe tokenizes the problem, its mushroom bodies classify the topic,
its central complex routes to a symbolic solver circuit, and its legs do the math.
When it's right, it flies up to heaven, off one end of the desk. When it's
wrong, it's dragged off the other end and punished in hell. Both are opt-in:
tick the **Heaven & hell** checkbox on the desk and the realms appear; leave
it unticked and the fly just celebrates or slumps where it sits.

**Eval accuracy: 60 / 60 hand-written problems (100%) · chance = 20%**

<img width="1440" height="725" alt="Screen Shot 2026-10-05 at 9 18 35 PM" src="https://github.com/user-attachments/assets/8f47e0ef-16ca-43db-a106-9b0f59cdf354" />

</div>

---

## What is this?

A fly, unfortunately, cannot not do physics. This is a **neuromorphic homage**: a tiny neural
network shaped by fly neuroanatomy does the pattern-recognition half of
problem solving, and hand-built symbolic "motor circuits" do the algebra,
the same division of labor as a brain plus a calculator.

| Fly region | Role | Here |
|---|---|---|
| **Optic lobe** (lamina → medulla → lobula) | motion & form vision | tokenizes quantities + units (`5 kg`, `30°`, `2.4 m/s²`) and physics keywords |
| **Mushroom bodies** (Kenyon cells) | learning, sparse codes | a 24-unit network classifies each problem into 12 topic families |
| **Central complex** (fan-shaped body) | action selection | routes to the right solver, blending innate keyword priors with learned classification |
| **Ventral nerve cord + legs** | motor programs | 12 symbolic circuits bind quantities to standard equations and compute |

The site trains in your browser in about a second, scores itself on
**60 hand-written problems it has never seen**, shows every mistake in a
confusion matrix, and lets you **lesion brain regions** to watch accuracy
collapse, live, in the 3D scene.

## Ask the fly anything

Click **Ask the fly** on the desk and type *any* AP Physics C question,
no answer key needed. The fly tokenizes it, classifies the topic, routes to
a solver circuit, and pencils its computed answer onto the paper
(e.g. `Answer: 96 J`). It holds the answer until you advance, never counts toward
its score, and lesions apply to your question too: a lesioned fly gives
you a damaged answer. After each answer the fly asks **Was the
fly right?** Say *Wrong*, name the topic it was about, and the fly
learns: an episodic memory recalls your verdict on similar phrasings and a
an SGD step reshapes its mushroom-body network. Graded practice problems
teach it automatically from their answer key.

Or **paste a screenshot** of the problem straight into the box (or drop or
pick a file). The fly reads it in your browser, repairs the math OCR gets
wrong, and shows you what it read (with a confidence score and the specific
numbers it was unsure about) before it solves anything.

## Answering in terms of variables

Ask for an answer "in terms of *m* and *v*" and the fly gives you the
expression, not just a number:

```
A block of mass m = 2.0 kg moves at speed v = 4.0 m/s in a circle of
radius 3.0 m. Find the centripetal force in terms of m, v and r.

  Answer: mv²/r — 10.7 N for the given values
```

`src/core/symbolic.ts` evaluates the same `parseForm` AST the dimensional
rescue already uses, but with a value that is either a number or an
unevaluated expression. A `Sym` is lazy, so "symbolic when it has to be,
numeric when it doesn't" falls out of the data model rather than needing two
solvers: `materialize()` folds to a number exactly when every leaf resolves.

- **Variables are read, not guessed.** `tokenizeVars()` takes a variable from
  an explicit assignment (`m = 2.0 kg`) or a cue word (`of mass m`), and from
  the list a question enumerates (`in terms of m, v and r`). It is a separate
  export from `tokenize()`, so the network's feature vector is provably
  unchanged.
- **Your spelling wins.** "A block of mass M" gets an answer in `M`.
- **Options are compared as expressions.** `mv²/r`, `m v^2 / r`, `m*v^2/r` and
  `F = mv²/r` all canonicalize to the same string; `2mv²/r` does not. Forms
  that canonical treats as different are compared numerically under awkward
  probe values, but only when both sides mention exactly the same variables.
- **Ordinary questions are untouched.** The numeric path, the circuits, and
  the accuracy gates behave exactly as before; symbolic engages only when the
  question asks for it.

## Reading the fly's work

The thought timeline is for *watching*: one stage at a time, and the detail
card is overwritten as the show moves on. When the fly has an answer, **Show
the fly's work** (or press `W`) opens the whole trace on one sheet: the
quantities it pulled off the page, the classifier's full 12-way distribution,
the circuit that actually ran, and every equation, substitution and runner-up
it considered, in order.

The sheet renders the `ThoughtRecord` the pipeline already produced; nothing
in it is recomputed, so it cannot disagree with what the fly did. That
makes it the place to see the awkward parts: a question classified as
`kinematics` that belongs under `circuits`, a circuit that had to be rerouted
because it couldn't bind the phrasing, or the equation the dimensional rescue
picked and the two it passed over.

It is equally careful about grading too. A question you handed the fly has no answer
key, so the sheet never claims the fly was right or wrong; it prints what it
computed and marks its classification neutrally instead of as a mistake.

## Teaching the fly

When you tell the fly it got one of your questions wrong, or correct it ("this is `shm`"), two things happen. It writes an **episodic memory**, so a similar
phrasing asked later recalls *your* verdict and overrides the classifier. And it
joins a **corpus**: a small, shareable record of the teach that other people's
flies can learn from.

**What leaves your device is narrower than what you typed.** Numbers and named
constants are stripped from the wording, and the physics *values* stay only as
features inside the vector the fly learns from, so `2.0 m` becomes `length`, and
the raw digits do not travel. What does travel is the phrasing itself, unchanged.
The Training tab lists the exact queue, and **Forget this device** erases it.

**The corpus is shared, never the weights.** Gradient steps don't compose:
averaging ten people's `w0`/`w1` is unsound, and replaying the same steps in
different orders gives ten different brains. So every client replays one
canonically-ordered corpus and lands on identical weights; that is what makes
"the fly remembers on any computer" a fact rather than a hope. A pre-trained
weight snapshot ships with the build as a fast start (13.7 KB for all 2,604
weights), and it records which corpus entries are already baked in so a client
replays only what is new to it.

Merging is a union with vote counting, keyed on *(phrasing, topic)* and attributed
to an anonymous per-browser install id. So merging is idempotent (re-importing
the same file, or a retried upload, adds no new voice), order-independent, and
loses nothing; there is no coordinator and no conflict to resolve. Ten people
teaching the same phrasing is ten votes, weighted but capped.

**Out of the box there is no server.** This is a static bundle, so a teach is
remembered on the machine that gave it, survives a reload, and travels through
exports you merge by hand:

```bash
# someone exports "hive.json" from the Training tab
cp their-hive.json corpus/inbox/hive-someone.json
npm run hive:merge      # dedupe, vote-count, report what changed
npm run brain:build     # retrain deterministically + replay the hive → public/brain.json
# deploy
```

`brain:build` is deterministic: same corpus, same seed, same weights. If no
snapshot is present (first run, offline, or one built for a different feature
layout) the app falls back to training in the browser exactly as it always has.

**To turn on live upload**, set `VITE_HIVE_ENDPOINT` to anything that answers
`GET` and `POST`: a Cloudflare Worker with KV, a Supabase edge function, a tiny
proxy:

```bash
echo 'VITE_HIVE_ENDPOINT=https://my-hive.example.workers.dev' > .env.local
```

Then teches push in batches and pulls are merged on boot. Nothing changes in the
UI, and with the variable unset every path is a silent no-op; the panel says so
rather than pretending. **A public write endpoint needs rate limiting and payload
caps server-side**; the client batches and caps, but that is not a substitute.

**What is deliberately not shared:** the answer-key auto-teach that runs when the
fly works a graded problem. Those problems already ship in the eval bank, and
uploading them would share the whole bank.

## The two sheets

The fly solves from the same two pages you get on the exam, kept as data in
`equation-sheet.ts` and `constant-table.ts` and rendered in the **Reference**
tab, so they can never drift apart:

- **Every answer names its equation.** `F_c = mv²/r · Circular motion and
  rotation` appears in the thought timeline,derived from what the circuit
actually bound, no solver file had to change to get it.
- **Every number is cited.** "Constants used: 5.97 × 10²⁴ kg, 6.37 × 10⁶ m,
  9.8 m/s²". Constants the problem *implies* ("at the surface of Mars") are
  supplied and named rather than hardcoded per branch.
- **Questions about the table are answered.** "What is g on Mars?" →
  3.73 m/s²; "What is the mass of Jupiter?"; "How much does a 70 kg person
  weigh on the Moon?"
- **The sheet rescues what no circuit covers.** When every hand-written
  circuit declines, the fly searches the sheet for an equation whose variables
  all bind, evaluates it, and cites it, or declines, because a wrong number
  is worse than silence. That search is dimensional analysis: each of the
  30 unit families has an SI dimension, and a test asserts every one of the
  ~80 sheet entries is dimensionally self-consistent.

## Topics covered (full AP Physics C)

**Mechanics**: kinematics · Newton's laws · energy/work · momentum/collisions ·
rotation · SHM · gravitation **E&M**: electrostatics · capacitors · DC circuits ·
magnetism · induction

Multiple choice (AP-style, 5 options, physics-literate distractors). The
network is graded on a hand-written bank separate from its training
generators; the training/eval split is enforced.

## Getting started

```bash
npm install
npm run dev          # → http://localhost:5173/FlyPhysicsC/ (the vite base path)
npm test             # 205 tests: round-trip, accuracy gates, tokenizer, lesions, fuzz, freeform, hard phrasings, feedback, circular-motion unit, constants, equation sheet, dimensional rescue, OCR normalization, error reporting, symbolic answers, the fly's work, the hive, hot-path regression guards
npm run build        # typecheck + production build
npm run brain:build  # rebuild the shipped brain from public/hive.json (deterministic)
npm run ocr:assets   # one-time: vendor the OCR engine into public/ocr (~11 MB) so the fly can read pictures offline
```

Deploy: any static host. `dist/` is a plain static bundle with no server
dependency. See below for GitHub Pages.

## Deploying to GitHub Pages

Live at **https://ginyuspecialforce.github.io/FlyPhysicsC/**, a GitHub Pages
**project site**, served from the `GinyuSpecialForce/FlyPhysicsC` repo's
`main` branch. It is a static bundle; Pages just serves `dist/`, built by
GitHub Actions; the workflow's artifact is what gets deployed, never the
branch, so nothing in the repo is served directly.

One-time setup, on github.com:

1. Create a repository named **`FlyPhysicsC`** under the owning account and
   make it public (a private repo needs a paid plan to publish Pages). The
   repo name becomes the URL path, so keep it (and `base`, below) in sync.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. Push this source tree to `main`.

```bash
git remote add origin https://github.com/GinyuSpecialForce/FlyPhysicsC.git
git push -u origin main
```

The workflow in `.github/workflows/ci.yml` then runs on every push to `main`
(and on pull requests, where the same gate runs without deploying), on Node
22: `npm ci` → `npx tsc --noEmit` → `npm test` → `npm run brain:build` →
`npm run build` → upload `dist/` as the Pages artifact → deploy. A type error
or a failing test fails the deploy rather than shipping something broken.

`brain:build` runs in CI on purpose: it is deterministic, so it reproduces
the committed `public/brain.json` exactly, but if someone edits the corpus
and forgets to rebuild locally, the deployed brain still matches the corpus
instead of quietly going stale.

Re-publish without a commit: the **Actions** tab → *CI* → *Run workflow*.

**This is a project site, so `base` is `"/FlyPhysicsC/"`** in `vite.config.ts`,
the URL path the repo name produces, case included. A user site
(`account.github.io`, served at the root) would use `base: "/"`, and that is
the only line that differs: every runtime path goes through
`import.meta.env.BASE_URL`, including the `brain.json` and `hive.json` the fly
loads at boot. Rename the repo and `base` has to follow.

A stray committed `dist/` cannot affect what Pages serves (it deploys the
workflow artifact), but delete it anyway so nobody mistakes it for the
deployed build.

**Not committed, by design:** `dist/` and `node_modules/`. Everything else is,
including the 10 MB of OCR assets in `public/ocr`; they're committed on
purpose so a deploy needs no network fetch and the picture-reading feature
works on a first clone.

## The views

- **Desk** — the 3D scene: study room, lamp, paper (the live problem is
  rendered onto it), and a fully procedural fly rebuilt for fidelity: a
  lathe-profiled body with abdominal banding and dorsal bristles, red
  compound eyes, proboscis, two-segment antennae, three-segment legs planted
  on the desk (with idle grooming), iridescent swept wings, and a contact
  shadow. The thought timeline walks through each pipeline stage with the
  actual data; click any stage to inspect; the show holds while you look,
  and the next click lets it run again.
  Once the fly has an answer, **Show the fly's work** (or `W`) opens the whole
  trace at once: quantities, the classifier's full distribution, the equation
  it cited and the ones it passed over.
  The fly never works on its own: click **Ask the fly** to type any
  question, or **Practice problem** to pull one from the set; otherwise
  it just grooms and waits. Free-orbit is the default (drag to look around,
  scroll to zoom); Desk / Brain cams ease to preset framings.
- **Brain Atlas** — a separate orbit-able view of the anatomically-grounded
  CNS: lamina→medulla→lobula→lobula plate optic lobes, mushroom bodies with
  calyx/peduncle/α-β/γ lobes, the central complex stack (bridge, fan-shaped
  body, ellipsoid body, noduli), antennal lobes with glomeruli, lateral
  horn, SEZ, and a ventral nerve cord with thoracic neuromeres and leg motor
  pools. Live pipeline stages pulse through the wiring while the fly works at
  its desk; click any neuropil (in 3D or via the legend) for what it does.
- **Training** — train from scratch with any seed (deterministic: same seed,
  same brain). Live accuracy curve, confusion matrix, per-topic table.
- **Lesion lab** — ablate a region and re-grade the exam: intact **100%**,
  optic lobe **53%**, mushroom bodies **10%**, central complex **13%**,
  motor **0%**. Clicking a lesion applies it to the fly on the desk
  immediately.
- **Reference** — the AP Physics C equation sheet and the constants table,
  rendered from the same data the circuits solve with. What the fly cites is
  what you read here.

## Project layout

```text
src/
  core/               dependency-free engine (Node-testable, no DOM)
    tokenizer.ts      quantity+unit extraction, SI conversion
    normalize.ts      math repair for typed and OCR'd text
    features.ts       slot → feature vector, topic list, keywords
    units.ts          unit-family → SI dimension table
    network.ts        the mushroom bodies (deterministic MLP)
    priors.ts         innate keyword priors + prior blending (central complex bias)
    lesions.ts        lesion registry + brain factory (single source of truth)
    brain.ts          the full pipeline + stage traces for 3D
    equation-sheet.ts the AP sheet as data (formula, variables, inverse forms)
    form-ast.ts       the shared form grammar (parseForm) — one parser, two evaluators
    dimension-solver.ts dimensional analysis over that AST, plus the rescue search
    textbook.ts       standard setups recognized outright (Atwood, incline, RC, rolling, …)
    symbolic.ts       answers in terms of variables: evaluate, print, compare
    corpus.ts         the shared hive: normalize, validate, merge, replay
    serialize.ts      brain snapshot encode/decode (shipped weights)
    hive-store.ts     this device's memory (localStorage), injectable Storage
    sync.ts           pluggable transport for live hive sync (never throws)
    constant-table.ts the constants table; constant-answers.ts direct lookups
    ocr.ts            in-browser image reading (lazy, optional)
    train.ts          training loop, eval, registry-driven lesion evals
    eval-bank.ts      60 hand-written exam problems
    bank.ts           synthetic problem generation
    topics/           one module per topic: generator + solver circuit
  ui/                 DOM modules: sequencer, timeline, work sheet, hive panel, views (styles.css)
  viz/                Three.js: scene, fly, brain hologram, atlas, camera director
scripts/              fetch-ocr-assets.mjs (one-time OCR vendoring),
                      build-brain.ts + merge-hive.ts (hive:merge / brain:build)
public/               brain.json + hive.json (the brain that ships with the site)
corpus/inbox/         drop contributed hive-*.json here
test/                 vitest
```

## Design notes

- **Deterministic everything** — one seeded RNG (`mulberry32`) drives
  training shuffles, problem generation, and demo problems. Same seed,
  same brain, same answers, forever.
- **Round-trip tested** — every generator's answer must survive
  `tokenize → classify → route → circuit-solve → choice-match` at ≥90% per
  topic on fresh problems; the eval gate is ≥85% on the hand-written bank.
- **The answer-matcher is scale-aware** — circuits compute in SI; choices
  may read `120 μC` or `8×10⁻¹⁴ N`. A `displayScale` bridges them.

## Tests

```text
- round-trip: generators → tokenizer → circuits (≥90% per topic, fresh problems)
- eval gate: ≥85% on the 60-problem hand-written bank (currently 100%)
- classification well above chance
- tokenizer: compound units, longest-first parsing, SI conversion
- lesions: every registry lesion measurably degrades the exam bank
- regression: a central-complex lesion without an explicit rng still lesions
- freeform: typed questions solve end-to-end; unsolvable ones say so
- freeform robustness: worded units ("6 volts", "meters per second") and question phrasings solve
- generator fuzz: always 5 valid string choices, valid answer index
- circular-motion unit regression: the full homework set (uniform circular
  motion, centripetal/centrifugal, parametric & cycloid, nonuniform circular,
  universal gravitation, field strength, orbits, Kepler's 3rd law) pinned to
  the course answer key
- constants table: unique ids, every body's g = GM/R², implied constants, and
  direct questions ("g on Mars", "weight on the Moon", "escape velocity")
- equation sheet: every form parses and every entry's dimension matches the
  family it claims to produce; inverse directions round-trip
- dimensional rescue: solves phrasings no circuit covers, and DECLINES on the
  ones it cannot (altitude geometry, missing quantities, wrong answer family)
- OCR normalization: exponents, misread digits, spelled fractions, flattened
  units, wrapped lines — and multiple-choice pages that parse options without
  eating a homework problem's sub-parts
- symbolic answers: printing, canonical form, reading a printed option back
  in, variable extraction (and the quantities it must NOT mistake for
  variables), the rescue giving both the expression and its value, and a
  multiple-choice question matched by expression rather than by number
- the fly's work: the answer header (and no subline repeating a number it
  already gives), the givens table, the classifier's full distribution with
  every bar filled, misclassifications called out rather than hidden, the OCR
  source block, every stage summary and detail in order — grading claims
  withheld on keyless questions, and untrusted text escaped throughout
- the hive: normalization that still recalls on a raw question typed locally,
  merge that is idempotent/order-independent/vote-capped, replay that is
  deterministic and actually moves the classifier, snapshot round-trips, and
  untrusted payloads (NaN features, unknown topics, future versions, junk)
  rejected instead of poisoning the shipped brain
- hot-path regression guards: `trainStep` stays bit-identical to the
  staged-gradient reference (the brain.json determinism invariant rests on
  that math), allocates no per-sample gradient matrices (counted with V8
  allocation sampling against the staged reference), and keeps a bounded
  per-step cost
- hive storage: reload survival, corrupt and foreign-version data discarded,
  stale local weights dropped when the site ships a new brain, quota failure
  degraded to in-memory, and sync never throwing — unreachable hive keeps the
  fly working offline
```

## License

MIT. See [LICENSE](LICENSE).
