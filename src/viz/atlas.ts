/**
 * The Brain Atlas: a separate 3D view showing the anatomical fly CNS
 * (shared builder in flyBrain.ts), orbit-able, labeled, and clickable.
 * The same stage activations that drive the desk hologram drive this brain,
 * so you can watch real pipeline stages light up real neuropils.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildFlyBrain } from "./flyBrain";

export type AtlasRegion = import("./flyBrain").BrainRegion;

export interface BrainAtlas {
  group: THREE.Group;
  /** light up a pipeline stage ("off" = rest); same ids as the sequencer */
  activate: (stage: string) => void;
  /** select a neuropil by name (null clears); draws an outline + focuses info */
  select: (name: string | null) => void;
  /** neuropils ordered back-to-front for the legend */
  regions: AtlasRegion[];
  /** register a callback for neuropil clicks (null = clicked empty space) */
  onPick: (cb: (name: string | null) => void) => void;
  /** pause/resume rendering + pulse spawning (call when the view hides) */
  setVisible: (v: boolean) => void;
  /** one-line description of a neuropil for the info panel */
  describe: (name: string) => string;
  tick: (dt: number, t: number) => void;
  dispose: () => void;
}

/** Info-panel blurbs for the named neuropils. */
const BLURBS: Record<string, string> = {
  "Central brain": "The supraesophageal ganglion — the central mass that houses the learning and routing centers.",
  Lamina: "First optic neuropil: ~800 parallel cartridges, one per visual column, right behind the eye.",
  Medulla: "The largest optic neuropil — 40,000 neurons across ~10 layers processing motion and color.",
  Lobula: "Deep optic neuropil where wide-field motion and feature detection emerges.",
  "Lobula plate": "Houses the giant tangential cells that compute optic flow — the fly's flight stabilizer.",
  Calyx: "The mushroom body's input cup: ~2,000 Kenyon cells receive olfactory and other sensory input here.",
  Peduncle: "The stalk of Kenyon-cell axons running from the calyx down to the lobes.",
  "Vertical lobe (α/α′)": "One of the mushroom body output lobes — roles in short-term memory and aversive learning.",
  "Medial lobe (β/β′)": "The horizontally-running output lobe, implicated in long-term memory.",
  "Gamma lobe": "The third lobe; its Kenyon cells undergo adult neurogenesis and handle early memories.",
  "Protocerebral bridge": "The handlebar-shaped top of the central complex — a head-direction map.",
  "Fan-shaped body": "The central complex's main hub: action selection, orientation, and sleep drive.",
  "Ellipsoid body": "A ring neuropil tracking the fly's egocentric heading — its inner compass.",
  Nodulus: "Paired nodules at the bottom of the central complex, tied to angular velocity.",
  "Antennal lobe": "The olfactory hub: ~50 glomeruli per side where odor identity is first computed.",
  "Antennal lobe glomeruli": "Spherical subunits, one per odorant receptor class — smell arrives pre-sorted.",
  "Lateral horn": "Hard-wired olfactory output — innate attraction and avoidance lives here.",
  "Subesophageal zone (SEZ)": "Taste and feeding control center, gripping the esophagus.",
  "Ventral nerve cord": "The spinal cord equivalent — carries motor commands down to the legs.",
  "Thoracic neuromeres": "Pro-, meso- and metathoracic segments, each wiring one pair of legs.",
  "Leg motor pools": "Premotor circuits that drive each leg pair — where 'motor circuits' execute.",
};

const LABELS: Array<[string, [number, number, number]]> = [
  ["Medulla", [-1.42, 0.22, 0.14]],
  ["Calyx", [0.52, 0.6, -0.24]],
  ["Fan-shaped body", [0, 0.36, -0.42]],
  ["Antennal lobe", [0.44, -0.1, 0.74]],
  ["Ventral nerve cord", [0, -1.34, 0.1]],
];

export function createBrainAtlas(canvas: HTMLCanvasElement): BrainAtlas {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
  camera.position.set(0, 1.6, 7.2);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0x3a4060, 1.4));
  const key = new THREE.DirectionalLight(0xbfd4ff, 2.2);
  key.position.set(3, 4, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff9a6a, 1.1);
  rim.position.set(-4, 2, -5);
  scene.add(rim);
  const under = new THREE.DirectionalLight(0x6a7dff, 0.7);
  under.position.set(0, -4, 2);
  scene.add(under);

  const built = buildFlyBrain({ physical: true });
  const brain = built.group;
  scene.add(brain);

  // labels: sprite text tags on the major named regions
  function makeLabel(text: string): THREE.Sprite {
    const pad = 8;
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d")!;
    ctx.font = "600 30px 'Segoe UI', system-ui, sans-serif";
    const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
    c.width = w;
    c.height = 44;
    const ctx2 = c.getContext("2d")!;
    ctx2.font = "600 30px 'Segoe UI', system-ui, sans-serif";
    ctx2.fillStyle = "rgba(10, 12, 20, 0.72)";
    ctx2.beginPath();
    ctx2.roundRect(0, 0, w, 44, 10);
    ctx2.fill();
    ctx2.fillStyle = "#dfe6f2";
    ctx2.fillText(text, pad, 31);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    sprite.scale.set((w / 44) * 0.085, 0.085, 1);
    return sprite;
  }
  for (const [text, pos] of LABELS) {
    const sprite = makeLabel(text);
    sprite.position.set(...pos);
    brain.add(sprite);
  }

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, -0.1, 0);
  controls.minDistance = 2.2;
  controls.maxDistance = 14;

  /** Frame the whole CNS in the visible area (leaving room for the side panel). */
  function frame(): void {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    const panelW = w > 700 ? 344 : 0; // desktop info panel + margins
    camera.aspect = (w + panelW) / h;
    camera.setViewOffset(w + panelW, h, panelW, 0, w, h);
    const radius = 1.75;
    const vFov = (camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const hFrac = w / (w + panelW);
    const dv = radius / Math.sin(vFov / 2);
    const dh = radius / (Math.tan(hFov / 2) * hFrac);
    const dist = Math.max(dv, dh);
    const dir = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(controls.target).add(dir.multiplyScalar(dist));
  }
  const ro = new ResizeObserver(() => frame());
  ro.observe(canvas);
  frame();
  controls.update();

  built.onPick((name) => onPick?.(name));
  built.bindPicking(canvas, camera);

  let onPick: ((name: string | null) => void) | null = null;

  function tick(dt: number, t: number): void {
    built.tick(dt, t);
    // slow breathing sway
    brain.rotation.y = Math.sin(t * 0.25) * 0.12;
    controls.update();
    renderer.render(scene, camera);
  }

  function dispose(): void {
    ro.disconnect();
    controls.dispose();
    renderer.dispose();
  }

  return {
    group: brain,
    activate: (stage) => built.activate(stage),
    select: (name) => built.select(name),
    regions: built.regions,
    onPick: (cb) => {
      onPick = cb;
    },
    setVisible: (v) => built.setVisible(v),
    describe: (name) => BLURBS[name] ?? "A region of the fly CNS.",
    tick,
    dispose,
  };
}
