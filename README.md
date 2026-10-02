<div align="center">

# Fly Physics C

**A virtual fly brain that learned AP Physics C — watch it think, in 3D.**

A fly sits at a desk, waiting for you to hand it a question. Above it
floats a holographic brain:
its optic lobe tokenizes the problem, its mushroom bodies classify the topic,
its central complex routes to a symbolic solver circuit, and its legs do the math.
When it's right, it buzzes its wings. When it's wrong, it slumps.

**Eval accuracy: 60 / 60 hand-written problems (100%) · chance = 20%**

</div>

---

## What this is (honestly)

A fly does not do physics. This is a **neuromorphic homage**: a tiny neural
network shaped by real fly neuroanatomy does the pattern-recognition half of
problem solving, and hand-built symbolic "motor circuits" do the algebra —
the same division of labor as a brain plus a calculator.

| Fly region | Real job | Here |
|---|---|---|
| **Optic lobe** (lamina → medulla → lobula) | motion & form vision | tokenizes quantities + units (`5 kg`, `30°`, `2.4 m/s²`) and physics keywords |
| **Mushroom bodies** (Kenyon cells) | learning, sparse codes | a 24-unit network classifies each problem into 12 topic families |
| **Central complex** (fan-shaped body) | action selection | routes to the right solver, blending innate keyword priors with learned classification |
| **Ventral nerve cord + legs** | motor programs | 12 symbolic circuits bind quantities to standard equations and compute |

The site trains in your browser in about a second, scores itself on
**60 hand-written problems it has never seen**, shows every mistake in a
confusion matrix, and lets you **lesion brain regions** to watch accuracy
collapse — live, in the 3D scene.

## Ask the fly anything

Click **Ask the fly** on the desk and type *any* AP Physics C question —
no answer key needed. The fly tokenizes it, classifies the topic, routes to
a solver circuit, and pencils its computed answer onto the paper
(e.g. `Answer: 96 J`). It holds the answer until you advance, never counts toward
its score, and lesions apply to your question too — a lesioned fly gives
you a damaged answer, honestly. After each answer the fly asks **Was the
fly right?** — say *Wrong*, name the topic it was really about, and the fly
learns: an episodic memory recalls your verdict on similar phrasings and a
real SGD step reshapes its mushroom-body network. Graded practice problems
teach it automatically from their answer key.

## Topics covered (full AP Physics C)

**Mechanics** — kinematics · Newton's laws · energy/work · momentum/collisions ·
rotation · SHM · gravitation **E&M** — electrostatics · capacitors · DC circuits ·
magnetism · induction

Multiple choice (AP-style, 5 options, physics-literate distractors). The
network is graded on a hand-written bank separate from its training
generators — the training/eval split is real.

## Getting started

```bash
npm install
npm run dev        # → http://localhost:5173/fly-physics-c/
npm test           # 30 tests: round-trip, accuracy gates, tokenizer, lesions, fuzz, freeform, hard phrasings, feedback, circular-motion unit
npm run build      # typecheck + production build
```

Deploy: any static host. For GitHub Pages, push `dist/` (the Vite `base` is
already set for project-site paths).

## The views

- **Desk** — the 3D scene: study room, lamp, paper (the live problem is
  rendered onto it), and a fully procedural fly rebuilt for fidelity: a
  lathe-profiled body with abdominal banding and dorsal bristles, red
  compound eyes, proboscis, two-segment antennae, three-segment legs planted
  on the desk (with idle grooming), iridescent swept wings, and a contact
  shadow. The thought timeline walks through each pipeline stage with the
  actual data; click any stage to inspect — the show pauses while you look.
  The fly never works on its own: click **Ask the fly** to type any
  question, or **Practice problem** to pull one from the set — otherwise
  it just grooms and waits. Desk / Brain / Auto-director / Free-orbit
  cameras.
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
- **The Science** — what's real, what's homage, what's limited.

## Project layout

```text
src/
  core/               dependency-free engine (Node-testable, no DOM)
    tokenizer.ts      quantity+unit extraction, SI conversion
    features.ts       slot → feature vector, topic list, keywords
    network.ts        the mushroom bodies (deterministic MLP)
    priors.ts         innate keyword priors + prior blending (central complex bias)
    lesions.ts        lesion registry + brain factory (single source of truth)
    brain.ts          the full pipeline + stage traces for 3D
    train.ts          training loop, eval, registry-driven lesion evals
    eval-bank.ts      60 hand-written exam problems
    bank.ts           synthetic problem generation
    topics/           one module per topic: generator + solver circuit
  ui/                 DOM modules: sequencer, timeline, views (styles.css)
  viz/                Three.js: scene, fly, brain hologram, atlas, camera director
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
- **Honest AI** — the learning is classification; the math is symbolic.
  Where a circuit must assume a value the problem didn't give (e.g. μ = 0.2),
  the timeline says so.

## Tests

```text
- round-trip: generators → tokenizer → circuits (≥90% per topic, fresh problems)
- eval gate: ≥85% on the 60-problem hand-written bank (currently 100%)
- classification well above chance
- tokenizer: compound units, longest-first parsing, SI conversion
- lesions: every registry lesion measurably degrades the exam bank
- regression: a central-complex lesion without an explicit rng really lesions
- freeform: typed questions solve end-to-end; unsolvable ones say so
- freeform robustness: worded units ("6 volts", "meters per second") and question phrasings solve
- generator fuzz: always 5 valid string choices, valid answer index
- circular-motion unit regression: the full homework set (uniform circular
  motion, centripetal/centrifugal, parametric & cycloid, nonuniform circular,
  universal gravitation, field strength, orbits, Kepler's 3rd law) pinned to
  the course answer key
```

## License

MIT — see [LICENSE](LICENSE).
