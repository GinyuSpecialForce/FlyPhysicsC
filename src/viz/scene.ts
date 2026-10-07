/**
 * The 3D study room: renderer, camera (+ free orbit), lights, desk and its
 * setup (lamp, mug, books, pencil, mouse), the paper (canvas-textured with
 * the live problem, redrawn only when content changes), the anatomical fly
 * hologram, and post-processing. The fly module attaches into this scene.
 *
 * Efficiency notes: no transmission materials (each one forces a full extra
 * scene render per frame), one shadow-casting light, and the paper canvas
 * only redraws when its content actually changes.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer, RenderPass, EffectPass, BloomEffect } from "postprocessing";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createFly, type Fly } from "./fly";
import { createBrainHolo, type BrainHolo } from "./brain";
import { createRealms } from "./realms";

export interface SceneHandles {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  fly: Fly;
  brain: BrainHolo;
  setPaper: (text: string, choices: string[], highlights: number[]) => void;
  /** Set the penciled-in answer shown on the paper in freeform mode. */
  setFlyAnswer: (answer: string) => void;
  setLowPower: (on: boolean) => void;
  /** Show or hide heaven and hell (the feature is opt-in — see realmToggle). */
  setRealmsVisible: (on: boolean) => void;
  tick: (dt: number, t: number) => void;
  dispose: () => void;
}

/**
 * Desk-cam framing (the shot Free-orbit hands you when you switch to it).
 * Wide enough to hold heaven and hell off either end of the desk, and nudged
 * right so the HUD panel doesn't sit on top of heaven.
 */
export const DESK_POS = new THREE.Vector3(1.5, 3.0, 9.0);
export const DESK_LOOK = new THREE.Vector3(1.3, 2.1, 0.2);

export function createScene(mount: HTMLElement): SceneHandles {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x202128);
  scene.fog = new THREE.Fog(0x202128, 14, 30);

  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 100);
  camera.position.copy(DESK_POS);
  camera.lookAt(DESK_LOOK);

  // preserveDrawingBuffer stays off: nothing reads the WebGL canvas back
// (only the OCR 2D canvas is sampled), and keeping it costs GPU bandwidth
// on every frame.
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: false });
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;
  mount.appendChild(renderer.domElement);

  // free orbit: drag to look from any angle, wheel to zoom
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.copy(DESK_LOOK);
  controls.minDistance = 1.2;
  controls.maxDistance = 14;
  controls.maxPolarAngle = Math.PI * 0.52; // don't dive under the floor
  controls.enablePan = false;

  // ── lights ──────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x404560, 1.2));
  const lampLight = new THREE.PointLight(0xffd9a0, 26, 16, 2);
  lampLight.position.set(-2.2, 3.4, 0.4);
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.set(1024, 1024);
  lampLight.shadow.bias = -0.004;
  lampLight.shadow.radius = 4;
  scene.add(lampLight);
  const lampGlow = new THREE.PointLight(0xffb060, 7, 5, 2);
  lampGlow.position.set(-2.2, 3.15, 0.4);
  scene.add(lampGlow);
  const rim = new THREE.DirectionalLight(0x8fb0ff, 0.8);
  rim.position.set(3, 6, -4);
  scene.add(rim);

  // ── room ────────────────────────────────────────────────────────
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(16, 40),
    new THREE.MeshStandardMaterial({ color: 0x1a1d26, roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  floor.receiveShadow = true;
  scene.add(floor);

  // rug under the desk (coziness, cheap)
  const rug = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 32),
    new THREE.MeshStandardMaterial({ color: 0x232735, roughness: 1 }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0.2, 0.005, 0.4);
  rug.receiveShadow = true;
  scene.add(rug);

  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 14),
    new THREE.MeshStandardMaterial({ color: 0x141722, roughness: 1 }),
  );
  wall.position.set(0, 6, -7);
  scene.add(wall);

  // window with moonlight
  const win = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.0), new THREE.MeshBasicMaterial({ color: 0x2a3a55 }));
  win.position.set(3.4, 3.4, -6.97);
  scene.add(win);
  const moon = new THREE.DirectionalLight(0xbdd4ff, 1.0);
  moon.position.set(4, 5, -3);
  scene.add(moon);

  // ── desk ────────────────────────────────────────────────────────
  const deskTop = new THREE.Mesh(
    new THREE.BoxGeometry(6, 0.18, 2.6),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.7 }),
  );
  deskTop.position.set(0, 1.5, 0);
  deskTop.castShadow = true;
  deskTop.receiveShadow = true;
  scene.add(deskTop);
  for (const [lx, lz] of [[-2.7, -1.05], [2.7, -1.05], [-2.7, 1.05], [2.7, 1.05]]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 1.5, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x54381f, roughness: 0.8 }),
    );
    leg.position.set(lx, 0.75, lz);
    scene.add(leg);
  }

  // desk lamp (arm + shade)
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x2e3440, roughness: 0.5, metalness: 0.4 });
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.08, 20), lampMat);
  lampBase.position.set(-2.2, 1.63, 0.4);
  lampBase.castShadow = true;
  scene.add(lampBase);
  const lampArm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 10), lampMat);
  lampArm.position.set(-2.2, 2.4, 0.4);
  lampArm.rotation.z = 0.25;
  scene.add(lampArm);
  const lampShade = new THREE.Mesh(
    new THREE.ConeGeometry(0.34, 0.36, 20, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x35506e, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide }),
  );
  lampShade.position.set(-2.2, 3.18, 0.4);
  scene.add(lampShade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 14), new THREE.MeshBasicMaterial({ color: 0xffe6b0 }));
  bulb.position.set(-2.2, 3.05, 0.4);
  scene.add(bulb);

  // ── desk setup: mug, books, pencil, mouse, coaster ──────────────
  const mug = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.14, 0.3, 18),
    new THREE.MeshStandardMaterial({ color: 0x9c4a3c, roughness: 0.6 }),
  );
  mug.position.set(2.4, 1.75, 0.7);
  mug.castShadow = true;
  scene.add(mug);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 16, Math.PI), lampMat);
  handle.position.set(2.24, 1.76, 0.7);
  handle.rotation.y = Math.PI / 2;
  scene.add(handle);

  const bookColors = [0x3d5a80, 0x98c1d9, 0x5a7d4a];
  bookColors.forEach((c, i) => {
    const book = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.1, 0.5),
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }),
    );
    book.position.set(2.3, 1.65 + i * 0.105, -0.6);
    book.rotation.y = (i - 1) * 0.2;
    book.castShadow = true;
    scene.add(book);
  });

  // pencil next to the paper (the fly's writing implement)
  const pencil = new THREE.Group();
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.42, 8),
    new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.6 }),
  );
  pencil.add(shaft);
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.018, 0.07, 8),
    new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.4 }),
  );
  tip.position.y = 0.245;
  tip.rotation.x = Math.PI;
  pencil.add(tip);
  const eraser = new THREE.Mesh(
    new THREE.CylinderGeometry(0.019, 0.019, 0.04, 8),
    new THREE.MeshStandardMaterial({ color: 0xd97a8a, roughness: 0.8 }),
  );
  eraser.position.y = -0.23;
  pencil.add(eraser);
  pencil.rotation.z = Math.PI / 2;
  pencil.rotation.y = 0.5;
  pencil.position.set(-0.85, 1.62, 0.75);
  pencil.castShadow = true;
  scene.add(pencil);

  // mouse + coaster on the right
  const coaster = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.14, 0.012, 20),
    new THREE.MeshStandardMaterial({ color: 0x50406a, roughness: 0.9 }),
  );
  coaster.position.set(1.55, 1.6, 0.85);
  scene.add(coaster);
  const mouse = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x22242c, roughness: 0.4 }),
  );
  mouse.scale.set(1, 0.55, 1.5);
  mouse.position.set(1.55, 1.63, 0.85);
  mouse.castShadow = true;
  scene.add(mouse);

  // ── paper (canvas texture, redrawn only when content changes) ───
  const paperCanvas = document.createElement("canvas");
  paperCanvas.width = 1024;
  paperCanvas.height = 768;
  const paperCtx = paperCanvas.getContext("2d")!;
  const paperTexture = new THREE.CanvasTexture(paperCanvas);
  paperTexture.colorSpace = THREE.SRGBColorSpace;
  const paper = new THREE.Mesh(
    new THREE.PlaneGeometry(2.5, 1.875),
    new THREE.MeshStandardMaterial({ map: paperTexture, roughness: 0.9 }),
  );
  paper.rotation.x = -Math.PI / 2;
  paper.rotation.z = Math.PI / 2;
  paper.position.set(0.1, 1.598, 0.15);
  paper.receiveShadow = true;
  scene.add(paper);

  let flyAnswer = "";
  function setFlyAnswer(answer: string): void {
    flyAnswer = answer;
  }

  let paperKey = "";
  function setPaper(text: string, choices: string[], highlights: number[]): void {
    const key = `${text}|${choices.join("~")}|${highlights.join(",")}|${flyAnswer}`;
    if (key === paperKey) return; // unchanged — skip the canvas redraw
    paperKey = key;

    const ctx = paperCtx;
    ctx.fillStyle = "#f5f0e6";
    ctx.fillRect(0, 0, 1024, 768);
    ctx.fillStyle = "#3a3630";
    ctx.font = "italic 24px Hack, monospace";
    ctx.textAlign = "center";
    ctx.fillText("AP Physics C — Problem Set 7", 512, 60);
    ctx.textAlign = "left";
    ctx.font = "26px Hack, monospace";
    const words = text.split(/\s+/);
    let line = "";
    let y = 120;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;        if (ctx.measureText(test).width > 920) {
          ctx.fillText(line, 52, y);
          line = w;
          y += 38;
      } else {
        line = test;
      }
      if (y > 360) break; // never crowd the choices block
    }
    if (line && y <= 360) ctx.fillText(line, 52, y);
    ctx.font = "25px Hack, monospace";
    let cy = 430;
    if (choices.length === 0) {
      ctx.fillStyle = "#1a3d1a";
      ctx.font = "italic 25px Hack, monospace";
      ctx.fillText(`Answer: ${flyAnswer}`, 70, 430);
    } else {
      choices.forEach((c, i) => {
        if (highlights.includes(i)) {
          ctx.fillStyle = "#ffe9a8";
          ctx.fillRect(40, cy - 30, 944, 42);
          ctx.fillStyle = "#1a3d1a";
        } else {
          ctx.fillStyle = "#3a3630";
        }
        ctx.fillText(`${"ABCDE"[i]})  ${c}`, 70, cy);
        cy += 56;
      });
    }
    ctx.strokeStyle = "#5a544c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(950, 720, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#5a544c";
    ctx.font = "16px Hack, monospace";
    ctx.textAlign = "center";
    ctx.fillText("fly", 950, 726);
    ctx.textAlign = "left";
    paperTexture.needsUpdate = true;
  }

  // ── fly + hologram ─────────────────────────────────────────────
  const fly = createFly();
  fly.group.position.set(0.4, 1.62, 1.15);
  fly.group.rotation.y = -0.4;
  scene.add(fly.group);
  fly.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = !(m.material as THREE.Material).transparent;
      m.receiveShadow = true;
    }
  });

  // heaven off the right end of the desk, hell off the left — hidden until
  // the human ticks the heaven/hell checkbox, since the feature is opt-in
  const realms = createRealms();
  realms.group.visible = false;
  scene.add(realms.group);

  const brain = createBrainHolo();
  // Floating over the desk, VNC reaching down toward the fly — the brain it's
  // attached to. Only the horizontal placement belongs out here: brain.tick()
  // owns the group's y (it gently floats) and its scale (HOLO_SCALE), so the
  // hologram keeps one size from the first frame rather than growing when a
  // question finally gets answered.
  brain.group.position.set(0, 3.6, 0.2);
  scene.add(brain.group);

  // ── post-processing ─────────────────────────────────────────────
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new BloomEffect({ intensity: 0.45, luminanceThreshold: 0.85, luminanceSmoothing: 0.1, mipmapBlur: true });
  composer.addPass(new EffectPass(camera, bloom));

  function resize(): void {
    const w = mount.clientWidth || 1;
    const h = mount.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  }
  window.addEventListener("resize", resize);
  resize();

  let lowPower = false;
  function setLowPower(on: boolean): void {
    lowPower = on;
    renderer.setPixelRatio(on ? 1 : Math.min(window.devicePixelRatio, 2));
    bloom.intensity = on ? 0.2 : 0.45;
  }

  function tick(dt: number, t: number): void {
    fly.tick(dt, t);
    realms.tick(dt, t, fly.visit());
    brain.tick(dt, t);
    controls.update();
    lampGlow.intensity = 7 + Math.sin(t * 9.3) * 0.4 + Math.sin(t * 23.7) * 0.2;
    if (!lowPower) composer.render();
    else renderer.render(scene, camera);
  }

  function dispose(): void {
    window.removeEventListener("resize", resize);
    controls.dispose();
    renderer.dispose();
    mount.removeChild(renderer.domElement);
  }

  return {
    scene,
    camera,
    renderer,
    controls,
    fly,
    brain,
    setPaper,
    setFlyAnswer,
    setLowPower,
    setRealmsVisible: (on) => (realms.group.visible = on),
    tick,
    dispose,
  };
}
