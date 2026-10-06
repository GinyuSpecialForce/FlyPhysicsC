/**
 * The anatomical fly brain, shared by the Brain Atlas view and the desk
 * hologram. One builder, two presentations: the atlas uses full-color glassy
 * neuropils with labels and picking; the desk hologram wraps the same group
 * in a holo shell (fresnel + scanlines) and floats it over the desk.
 *
 * Geometry is stylized but topologically faithful to the adult Drosophila
 * CNS: lamina→medulla→lobula→lobula plate optic lobes, mushroom bodies with
 * calyx/peduncle/α-β/γ lobes, the central complex stack (bridge, fan-shaped
 * body, ellipsoid body, noduli), antennal lobes + glomeruli, lateral horn,
 * SEZ, and a ventral nerve cord with thoracic neuromeres and leg pools.
 */
import * as THREE from "three";
import type { StageId } from "../core/stages";

export interface BrainRegion {
  /** neuropil name, e.g. "Medulla" ("" = unnamed sub-part) */
  name: string;
  /** functional group ("Optic lobe", "Mushroom bodies", …) */
  group: string;
  /** pipeline stage this neuropil performs (null = support tissue) */
  stage: StageId | null;
  /** side: -1 left, 1 right, 0 midline */
  side: -1 | 0 | 1;
  mesh: THREE.Mesh;
}

/** Stage order used for pulse travel + activation. */
export const STAGE_ORDER: StageId[] = ["encode", "classify", "route", "compute", "answer"];

/** Colors keyed by group — shared with the atlas legend via main.ts. */
/** Colors keyed by group — shared with the atlas legend via main.ts. */
export const GROUP_TONE: Record<string, number> = {
  "Optic lobe": 0x4fc3f7,
  "Mushroom bodies": 0x7fa0e6,
  "Central complex": 0xffd166,
  VNC: 0x8dffb0,
  "Antennal lobe": 0x74e8c0,
  "Lateral horn": 0x6fd9a8,
  "Central brain": 0x8fb0ff,
  SEZ: 0x8dffb0,
};

export interface BrainBuildOpts {
  /** true = atlas-style physical materials; false = emissive holo tint */
  physical: boolean;
  /** add sprite labels at fixed positions (atlas only) */
  labels?: boolean;
}

export interface FlyBrain {
  group: THREE.Group;
  regions: BrainRegion[];
  /** light up a pipeline stage ("off" = rest); drives emissive + pulses */
  activate: (stage: string) => void;
  /** select a neuropil by name (null clears); atlas outline */
  select: (name: string | null) => void;
  /** neuropil click callback (atlas picking) */
  onPick: (cb: (name: string | null) => void) => void;
  /** pause pulses + region ticking (call when the view hides) */
  setVisible: (v: boolean) => void;
  /** per-frame region glow easing + pulses; brain.rotation sway excluded */
  tick: (dt: number, t: number) => void;
  /** wire pointer picking on a canvas (atlas view only) */
  bindPicking: (canvas: HTMLCanvasElement, camera: THREE.PerspectiveCamera) => void;
}

/**
 * Build the anatomical CNS. `physical` chooses material family; everything
 * else (positions, geometry, region registry, pulses) is identical.
 */
export function buildFlyBrain(opts: BrainBuildOpts): FlyBrain {
  const brain = new THREE.Group();
  const regions: BrainRegion[] = [];

  const mat = (color: number, o: Partial<{ opacity: number; rough: number }> = {}): THREE.Material =>
    opts.physical
      ? new THREE.MeshPhysicalMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.18,
          transparent: true,
          opacity: o.opacity ?? 0.82,
          roughness: o.rough ?? 0.25,
          metalness: 0.05,
          clearcoat: 0.6,
          clearcoatRoughness: 0.35,
          depthWrite: false,
        })
      : new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.3,
          transparent: true,
          opacity: o.opacity ?? 0.55,
          roughness: 0.5,
          metalness: 0,
          depthWrite: false,
        });

  function add(
    geo: THREE.BufferGeometry,
    name: string,
    group: string,
    stage: StageId | null,
    side: -1 | 0 | 1,
    pos: [number, number, number],
    scale: [number, number, number],
    rot: [number, number, number],
    color: number,
    matOpts?: Partial<{ opacity: number; rough: number }>,
  ): void {
    const mesh = new THREE.Mesh(geo, mat(color, matOpts));
    mesh.position.set(...pos);
    mesh.scale.set(...scale);
    mesh.rotation.set(...rot);
    mesh.userData.name = name;
    brain.add(mesh);
    regions.push({ name, group, stage, side, mesh });
  }

  // ══════════════════════════════════════════════════════════════
  // Central brain — the supraesophageal ganglion silhouette
  // ══════════════════════════════════════════════════════════════
  add(new THREE.SphereGeometry(0.62, 36, 26), "Central brain", "Central brain", null, 0, [0, 0, 0.1], [1.15, 0.95, 0.9], [0, 0, 0], GROUP_TONE["Central brain"], { opacity: 0.4, rough: 0.5 });

  // ══════════════════════════════════════════════════════════════
  // Optic lobes (largest region): retina → lamina → medulla →
  // lobula → lobula plate, retinotopic tiles down each side
  // ══════════════════════════════════════════════════════════════
  for (const sx of [-1, 1] as const) {
    // lamina: curved monolayer of cartridges → bead chain hugging the medulla
    for (let i = 0; i < 7; i++) {
      const p = (i / 6 - 0.5) * 2;
      add(
        new THREE.SphereGeometry(0.048, 12, 10),
        i === 0 ? "Lamina" : "",
        "Optic lobe",
        "encode",
        sx,
        [sx * (1.02 + 0.03 * i), 0.34 - p * 0.2, 0.34 + Math.abs(p) * 0.05],
        [1, 1, 0.7],
        [0, 0, 0],
        GROUP_TONE["Optic lobe"],
      );
    }
    add(
      new THREE.CylinderGeometry(0.28, 0.25, 0.14, 24, 1, false),
      "Medulla",
      "Optic lobe",
      "encode",
      sx,
      [sx * 1.12, 0.08, 0.06],
      [1, 1.35, 1.5],
      [0, 0, (sx * Math.PI) / 2],
      0x38a8e8,
    );
    add(
      new THREE.CylinderGeometry(0.17, 0.15, 0.09, 20, 1, false),
      "Lobula",
      "Optic lobe",
      "encode",
      sx,
      [sx * 1.05, -0.1, -0.24],
      [1, 1.2, 1.4],
      [0, 0, (sx * Math.PI) / 2.2],
      0x2f8fd0,
    );
    add(
      new THREE.CylinderGeometry(0.15, 0.13, 0.08, 20, 1, false),
      "Lobula plate",
      "Optic lobe",
      "encode",
      sx,
      [sx * 0.96, -0.17, -0.38],
      [1, 1.2, 1.4],
      [0, sx * 0.3, (sx * Math.PI) / 2.1],
      0x2a7fbc,
    );
  }

  // ══════════════════════════════════════════════════════════════
  // Mushroom bodies: calyx (dorsal cup) → peduncle → α/β/γ lobes
  // ══════════════════════════════════════════════════════════════
  for (const sx of [-1, 1] as const) {
    add(new THREE.SphereGeometry(0.17, 20, 16), "Calyx", "Mushroom bodies", "classify", sx, [sx * 0.38, 0.42, -0.18], [1, 0.85, 0.75], [0, 0, 0], GROUP_TONE["Mushroom bodies"]);
    add(new THREE.CylinderGeometry(0.045, 0.06, 0.52, 12), "Peduncle", "Mushroom bodies", "classify", sx, [sx * 0.33, 0.1, -0.02], [1, 1, 1], [0.5, 0, sx * -0.15], 0x7fa8f0);
    add(new THREE.CylinderGeometry(0.05, 0.07, 0.42, 12), "Vertical lobe (α/α′)", "Mushroom bodies", "classify", sx, [sx * 0.28, -0.18, 0.12], [1, 1, 1], [0, 0, 0], 0x6f9ae8);
    add(new THREE.CylinderGeometry(0.05, 0.06, 0.34, 12), "Medial lobe (β/β′)", "Mushroom bodies", "classify", sx, [sx * 0.3, -0.38, 0.14], [1, 1, 1], [Math.PI / 2, 0, 0], 0x5f8ce0);
    add(new THREE.SphereGeometry(0.08, 14, 12), "Gamma lobe", "Mushroom bodies", "classify", sx, [sx * 0.3, -0.38, 0.32], [1, 0.8, 1], [0, 0, 0], 0x4f7cd8);
  }

  // ══════════════════════════════════════════════════════════════
  // Central complex — midline stack: bridge → fan → ellipsoid → noduli
  // ══════════════════════════════════════════════════════════════
  add(new THREE.TorusGeometry(0.34, 0.055, 12, 36, Math.PI), "Protocerebral bridge", "Central complex", "route", 0, [0, 0.34, -0.22], [1, 1, 1], [0, 0, Math.PI], GROUP_TONE["Central complex"], { opacity: 0.9 });
  // vertical fan facing the viewer: broad arc up top, apex down
  add(new THREE.CylinderGeometry(0.24, 0.28, 0.06, 28, 1, false, (Math.PI * 2) / 3, (Math.PI * 2) / 3), "Fan-shaped body", "Central complex", "route", 0, [0, 0.16, -0.26], [1.15, 1, 0.9], [Math.PI / 2, 0, 0], 0xffc94d, { opacity: 0.85, rough: 0.5 });
  add(new THREE.TorusGeometry(0.16, 0.04, 12, 32), "Ellipsoid body", "Central complex", "route", 0, [0, 0.02, -0.3], [1, 1, 1], [Math.PI / 2, 0, 0], 0xffbd45, { opacity: 0.95 });
  for (const sx of [-1, 1] as const) {
    add(new THREE.SphereGeometry(0.06, 12, 10), "Nodulus", "Central complex", "route", sx, [sx * 0.1, -0.12, -0.28], [1, 0.8, 1], [0, 0, 0], 0xffb03a);
  }

  // ══════════════════════════════════════════════════════════════
  // Antennal lobes (front): glomeruli bumps on each lobe
  // ══════════════════════════════════════════════════════════════
  for (const sx of [-1, 1] as const) {
    add(new THREE.SphereGeometry(0.17, 18, 14), "Antennal lobe", "Antennal lobe", null, sx, [sx * 0.3, 0.1, 0.52], [1, 0.95, 0.85], [0, 0, 0], GROUP_TONE["Antennal lobe"], { opacity: 0.85 });
    for (let g = 0; g < 5; g++) {
      const a = (g / 5) * Math.PI * 2;
      add(
        new THREE.SphereGeometry(0.045, 10, 8),
        g === 0 ? "Antennal lobe glomeruli" : "",
        "Antennal lobe",
        null,
        sx,
        [sx * 0.3 + Math.cos(a) * 0.13, 0.1 + Math.sin(a) * 0.13, 0.64],
        [1, 1, 0.8],
        [0, 0, 0],
        0x5fd9b0,
        { opacity: 0.95 },
      );
    }
  }

  // ══════════════════════════════════════════════════════════════
  // Lateral horn (flanking the MB calyx)
  // ══════════════════════════════════════════════════════════════
  for (const sx of [-1, 1] as const) {
    add(new THREE.SphereGeometry(0.12, 14, 12), "Lateral horn", "Lateral horn", null, sx, [sx * 0.62, 0.3, 0.08], [1.1, 0.9, 0.9], [0, 0, sx * 0.3], GROUP_TONE["Lateral horn"], { opacity: 0.8 });
  }

  // ══════════════════════════════════════════════════════════════
  // SEZ + VNC (neck + thoracic/abdominal neuromeres) + leg pools
  // ══════════════════════════════════════════════════════════════
  add(new THREE.SphereGeometry(0.22, 20, 16), "Subesophageal zone (SEZ)", "SEZ", null, 0, [0, -0.42, 0.08], [1.2, 0.7, 0.9], [0, 0, 0], GROUP_TONE.SEZ, { opacity: 0.75 });
  add(new THREE.CapsuleGeometry(0.11, 0.5, 6, 16), "Ventral nerve cord", "VNC", "compute", 0, [0, -0.95, 0.02], [1, 1, 1], [0, 0, 0], 0x7de8a4, { opacity: 0.85 });
  for (let i = 0; i < 3; i++) {
    add(new THREE.SphereGeometry(0.13 - i * 0.015, 14, 12), i === 0 ? "Thoracic neuromeres" : "", "VNC", "compute", 0, [0, -0.78 - i * 0.19, 0.02], [1.6, 0.8, 1.2], [0, 0, 0], 0x6fd994, { opacity: 0.85 });
  }
  for (const sx of [-1, 1] as const) {
    for (let i = 0; i < 3; i++) {
      add(
        new THREE.SphereGeometry(0.055, 10, 8),
        i === 0 ? "Leg motor pools" : "",
        "VNC",
        "compute",
        sx,
        [sx * 0.2, -0.76 - i * 0.16, 0.1],
        [1, 1, 1],
        [0, 0, 0],
        0x5fd984,
        { opacity: 0.9 },
      );
    }
  }

  // ── pipeline tract: one polyline the pulses visibly travel ──────
  // left medulla → central → MB calyx → CX → VNC → leg pool (right side
  // mirrors by symmetry of the anatomy itself)
  const chain: Array<[number, number, number]> = [
    [1.12, 0.08, 0.06],
    [0.55, 0.12, 0.1],
    [0.38, 0.42, -0.18],
    [0.15, 0.3, -0.22],
    [0, 0.16, -0.26],
    [0, -0.35, 0],
    [0, -0.95, 0.02],
    [0.2, -0.76, 0.1],
  ];
  const tractMat = new THREE.LineBasicMaterial({
    color: 0xbfe0ff,
    transparent: true,
    opacity: opts.physical ? 0.14 : 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  for (let i = 0; i < chain.length - 1; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...chain[i]),
      new THREE.Vector3(...chain[i + 1]),
    ]);
    brain.add(new THREE.Line(geo, tractMat));
  }

  // ── activation + pulses ─────────────────────────────────────────
  const pulses: { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number }[] = [];
  const pulseMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  // one geometry shared by every pulse — each pulse still needs its own
  // material instance because it fades independently
  const pulseGeo = new THREE.SphereGeometry(0.045, 10, 8);

  function stageAnchorWorld(stage: StageId, side: -1 | 0 | 1): THREE.Vector3 {
    const r = regions.find((x) => x.stage === stage && (x.side === side || x.side === 0) && x.name !== "");
    return r ? r.mesh.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
  }

  function spawnPulse(from: StageId, to: StageId): void {
    const a = stageAnchorWorld(from, -1);
    const b = stageAnchorWorld(to, -1);
    if (a.length() === 0 || b.length() === 0) return;
    const mesh = new THREE.Mesh(pulseGeo, pulseMat.clone());
    brain.add(mesh);
    pulses.push({ mesh, from: a, to: b, t: 0, dur: 0.6 });
  }

  let activeStage = "";
  let visible = true;

  function setVisible(v: boolean): void {
    visible = v;
  }

  function activate(stage: string): void {
    if (stage === activeStage) return;
    activeStage = stage;
    if (!visible) return;
    if (stage !== "off" && stage !== "answer") {
      const idx = STAGE_ORDER.indexOf(stage as StageId);
      if (idx > 0) spawnPulse(STAGE_ORDER[idx - 1], stage as StageId);
    }
  }

  function tick(dt: number, t: number): void {
    if (!visible) return;
    for (const r of regions) {
      const m = r.mesh.material as THREE.MeshPhysicalMaterial;
      const active = r.stage !== null && r.stage === activeStage;
      const base = opts.physical ? 0.18 : 0.3;
      const target = active ? (opts.physical ? 1.0 + 0.35 * Math.sin(t * 7 + r.mesh.position.x * 4) : 1.2 + 0.4 * Math.sin(t * 7 + r.mesh.position.x * 4)) : base;
      m.emissiveIntensity += (target - m.emissiveIntensity) * Math.min(1, dt * 7);
    }
    if (outline && selected) {
      const s = 1.12 + Math.sin(t * 4) * 0.03;
      outline.scale.set(selected.mesh.scale.x * s, selected.mesh.scale.y * s, selected.mesh.scale.z * s);
      outline.rotation.z += dt * 0.4;
    }
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.t += dt;
      const k = p.t / p.dur;
      if (k >= 1) {
        brain.remove(p.mesh);
        // geometry is shared across pulses — only the per-pulse material dies
        (p.mesh.material as THREE.Material).dispose();
        pulses.splice(i, 1);
        continue;
      }
      p.mesh.position.lerpVectors(p.from, p.to, k);
      p.mesh.position.y += Math.sin(k * Math.PI) * 0.08;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - k * 0.4);
    }
  }

  // ── atlas selection + picking (no-op without consumers) ─────────
  let selected: BrainRegion | null = null;
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.35, depthTest: false });
  let outline: THREE.Mesh | null = null;
  let onPick: ((name: string | null) => void) | null = null;

  function select(name: string | null): void {
    if (outline) {
      brain.remove(outline); // geometry shared with the region — never dispose here
      outline = null;
    }
    selected = name ? (regions.find((r) => r.name === name) ?? null) : null;
    if (selected) {
      outline = new THREE.Mesh(selected.mesh.geometry, outlineMat);
      outline.position.copy(selected.mesh.position);
      outline.scale.copy(selected.mesh.scale).multiplyScalar(1.12);
      outline.rotation.copy(selected.mesh.rotation);
      brain.add(outline);
    }
  }

  /** Wire pointer picking on a canvas (atlas only). */
  function bindPicking(canvas: HTMLCanvasElement, camera: THREE.PerspectiveCamera): void {
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downAt: { x: number; y: number } | null = null;
    canvas.addEventListener("pointerdown", (e) => {
      downAt = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener("pointerup", (e) => {
      if (!downAt) return;
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
      downAt = null;
      if (moved > 6) return; // drag, not a click
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(brain.children, false);
      const hit = hits.find((h) => (h.object.userData.name as string)?.length > 0);
      const name = hit ? (hit.object.userData.name as string) : null;
      select(name);
      onPick?.(name);
    });
  }

  return {
    group: brain,
    regions,
    activate,
    select,
    onPick: (cb) => {
      onPick = cb;
    },
    setVisible,
    tick,
    bindPicking,
  };
}
