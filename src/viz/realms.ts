/**
 * Heaven and hell: the two places a graded answer sends the fly. Heaven is a
 * cloud with a golden gate floating off the right end of the desk; hell is a
 * lava-filled crag rising from the floor off the left end, with a pitchfork
 * waiting. Both are fully procedural, like everything else in the room.
 *
 * The realms never decide anything — the fly owns its own trip (see fly.ts)
 * and reports where it is, and the realms just react: they brighten as it
 * arrives, and hell's pitchfork jabs in time with the fly's flinches.
 */
import * as THREE from "three";

export type Realm = "heaven" | "hell";

/** Where the fly is on its trip, as reported by the fly each frame. */
export interface RealmVisit {
  /** The realm it is headed to, staying in, or coming back from. */
  realm: Realm | null;
  /** 0 = at the desk … 1 = arrived. */
  presence: number;
  /** Seconds since it arrived (0 while travelling). */
  stay: number;
}

export interface Realms {
  group: THREE.Group;
  tick: (dt: number, t: number, visit: RealmVisit) => void;
}

const HEAVEN_POS = new THREE.Vector3(3.4, 3.0, -0.3);
const HELL_POS = new THREE.Vector3(-4.2, 0, -0.2);

/** The fly's body sits this far above its feet (see the stance in fly.ts). */
const FLY_LEG_HEIGHT = 0.37;

/** Where the fly's group ends up in each realm. */
export const REALM_PERCH: Record<Realm, THREE.Vector3> = {
  // hovering just over the cloud top
  heaven: new THREE.Vector3(HEAVEN_POS.x, HEAVEN_POS.y + 0.13 + FLY_LEG_HEIGHT, HEAVEN_POS.z),
  // feet on the hot slab in the middle of the lava
  hell: new THREE.Vector3(HELL_POS.x, HELL_POS.y + 1.06 + FLY_LEG_HEIGHT, HELL_POS.z),
};

/** Which way the fly faces once there (its head points down local −X). */
export const REALM_YAW: Record<Realm, number> = {
  heaven: -Math.PI - 0.6, // turned to look back across the desk, toward the camera
  hell: Math.PI - 0.5, // facing the desk it was dragged from, rear to the pitchfork
};

const POKE_PERIOD = 0.85;

/**
 * How hard the pitchfork is jabbing, 0..1, at a given moment of the fly's
 * stay. Shared by the pitchfork and the fly so the flinch lands on the jab.
 */
export function pokeStrength(stay: number): number {
  if (stay <= 0) return 0;
  const phase = (stay % POKE_PERIOD) / POKE_PERIOD;
  return phase < 0.3 ? Math.sin((phase / 0.3) * Math.PI) : 0;
}

/** A loose shell of drifting motes (sparkles in heaven, embers in hell). */
function motes(count: number, radius: number, height: number, color: THREE.Color, size: number): THREE.Points {
  const positions = new Float32Array(count * 3);
  // deterministic scatter — set dressing doesn't need a seeded RNG
  const hash = (n: number): number => {
    const x = Math.sin(n * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };
  for (let i = 0; i < count; i++) {
    const a = hash(i + 1) * Math.PI * 2;
    const r = radius * Math.sqrt(hash(i + 101));
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = height * hash(i + 201);
    positions[i * 3 + 2] = Math.sin(a) * r;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(
    geom,
    new THREE.PointsMaterial({
      color, size, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
}

export function createRealms(): Realms {
  const group = new THREE.Group();

  // ── heaven: cloud, golden gate, a shaft of light ────────────────
  const heaven = new THREE.Group();
  heaven.position.copy(HEAVEN_POS);
  group.add(heaven);

  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xf4f7ff, roughness: 1, emissive: 0x8a94b8, emissiveIntensity: 0.4,
  });
  /** Cloud puffs: [x, y, z, radius], squashed so the top is a soft platform. */
  const PUFFS: [number, number, number, number][] = [
    [0, -0.22, 0, 0.42], [0.45, -0.25, 0.1, 0.36], [-0.45, -0.26, 0.05, 0.38],
    [0.15, -0.28, -0.35, 0.36], [-0.2, -0.27, 0.35, 0.34], [0.8, -0.3, -0.05, 0.26],
    [-0.82, -0.3, -0.1, 0.27], [0.5, -0.3, -0.4, 0.28], [-0.55, -0.3, 0.38, 0.26],
  ];
  const cloud = new THREE.Group();
  for (const [x, y, z, r] of PUFFS) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), cloudMat);
    puff.position.set(x, y, z);
    puff.scale.y = 0.7;
    cloud.add(puff);
  }
  heaven.add(cloud);

  const gold = new THREE.MeshStandardMaterial({
    color: 0xe8c66a, roughness: 0.3, metalness: 0.8, emissive: 0x6b4e10, emissiveIntensity: 0.6,
  });
  for (const sx of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.0, 12), gold);
    pillar.position.set(sx * 0.5, 0.45, -0.5);
    heaven.add(pillar);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 8, 24, Math.PI), gold);
  arch.position.set(0, 0.95, -0.5);
  heaven.add(arch);

  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff2c4, transparent: true, opacity: 0.05, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.95, 3.2, 24, 1, true), beamMat);
  beam.position.y = 1.5;
  heaven.add(beam);

  const sparkles = motes(36, 0.95, 1.6, new THREE.Color(0xfff6d0), 0.04);
  heaven.add(sparkles);

  const heavenLight = new THREE.PointLight(0xfff0cf, 3, 6, 2);
  heavenLight.position.set(0, 1.3, 0.3);
  heaven.add(heavenLight);

  // ── hell: a crag full of lava, flames, and a pitchfork ──────────
  const hell = new THREE.Group();
  hell.position.copy(HELL_POS);
  group.add(hell);

  const rock = new THREE.MeshStandardMaterial({ color: 0x2a1a18, roughness: 1, flatShading: true });
  const crag = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 1.05, 1.0, 9), rock);
  crag.position.y = 0.5;
  hell.add(crag);
  // jagged rim
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    const h = 0.3 + ((i * 0.618034) % 1) * 0.3;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.11, h, 5), rock);
    spike.position.set(Math.cos(a) * 0.72, 1.0 + h / 2 - 0.03, Math.sin(a) * 0.72);
    spike.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25); // lean outward
    hell.add(spike);
  }

  // colors above 1.0 so the bloom pass picks them up as glowing
  const lavaMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5a1f).multiplyScalar(2.2) });
  const lava = new THREE.Mesh(new THREE.CircleGeometry(0.66, 24), lavaMat);
  lava.rotation.x = -Math.PI / 2;
  lava.position.y = 1.005;
  hell.add(lava);
  // the slab the fly is made to stand on
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.44, 0.06, 7), rock);
  slab.position.y = 1.03;
  hell.add(slab);

  const flameMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xff8a2a).multiplyScalar(1.8), transparent: true, opacity: 0.85, depthWrite: false,
  });
  // base at the origin, so scaling a flame makes it lick upward
  const flameGeom = new THREE.ConeGeometry(0.075, 0.4, 7).translate(0, 0.2, 0);
  const flames: THREE.Mesh[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const flame = new THREE.Mesh(flameGeom, flameMat);
    flame.position.set(Math.cos(a) * 0.54, 1.0, Math.sin(a) * 0.54);
    hell.add(flame);
    flames.push(flame);
  }

  const embers = motes(28, 0.8, 1.5, new THREE.Color(0xff7a30), 0.035);
  embers.position.y = 1.0;
  hell.add(embers);

  const hellLight = new THREE.PointLight(0xff4a1a, 4, 6, 2);
  hellLight.position.set(0, 1.7, 0.3);
  hell.add(hellLight);

  // pitchfork: built along +Y, then laid over to point across the slab (+X)
  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x5a1210, roughness: 0.4, metalness: 0.7, emissive: 0x400800, emissiveIntensity: 0.8,
  });
  const pitchfork = new THREE.Group();
  const forkShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.9, 8), ironMat);
  forkShaft.position.y = 0.45;
  pitchfork.add(forkShaft);
  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.03), ironMat);
  crossbar.position.y = 0.9;
  pitchfork.add(crossbar);
  for (const tx of [-0.105, 0, 0.105]) {
    const tine = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.17, 6), ironMat);
    tine.position.set(tx, 0.985, 0);
    pitchfork.add(tine);
  }
  pitchfork.rotation.z = -(Math.PI / 2 - 0.1); // tines fan vertically, so it reads as a trident from the desk cam
  pitchfork.visible = false;
  hell.add(pitchfork);
  /** Shaft base when poised behind the fly; a jab drives it forward from here. */
  const FORK_REST = new THREE.Vector3(-2.05, 1.3, -0.3);

  function tick(_dt: number, t: number, visit: RealmVisit): void {
    const inHeaven = visit.realm === "heaven" ? visit.presence : 0;
    const inHell = visit.realm === "hell" ? visit.presence : 0;

    // heaven drifts gently and brightens to receive the fly
    heaven.position.y = HEAVEN_POS.y + Math.sin(t * 0.7) * 0.03;
    cloud.rotation.y = Math.sin(t * 0.25) * 0.08;
    heavenLight.intensity = 3 + inHeaven * 11;
    beamMat.opacity = 0.05 + inHeaven * 0.13 + Math.sin(t * 1.3) * 0.01;
    sparkles.rotation.y = t * 0.25;
    sparkles.position.y = Math.sin(t * 0.9) * 0.08;

    // hell flickers always, and roars while it has a guest
    const flicker = Math.sin(t * 11.3) * 0.12 + Math.sin(t * 27.1) * 0.08;
    hellLight.intensity = (4 + inHell * 13) * (1 + flicker);
    flames.forEach((flame, i) => {
      const lick = 0.75 + Math.sin(t * (7 + (i % 3) * 2.3) + i * 1.9) * 0.3;
      flame.scale.set(1, lick * (1 + inHell * 1.1), 1);
    });
    embers.rotation.y = -t * 0.4;
    embers.position.y = 1.0 + Math.sin(t * 1.7) * 0.1;

    // the pitchfork slides in as the fly arrives, then jabs
    pitchfork.visible = inHell > 0.02;
    if (pitchfork.visible) {
      const jab = pokeStrength(visit.stay) * 0.32;
      pitchfork.position.set(FORK_REST.x - (1 - inHell) * 0.9 + jab, FORK_REST.y, FORK_REST.z);
    }
  }

  return { group, tick };
}
