/**
 * The fly: fully procedural (no model files). A lathe-profiled body with
 * head, bristles, three-segment legs, buzzing wings, and an animation state
 * machine synced to the brain's pipeline stages (plus idle grooming).
 */
import * as THREE from "three";
import { REALM_PERCH, REALM_YAW, pokeStrength, type Realm, type RealmVisit } from "./realms";

export type FlyState =
  | "idle"
  | "reading"
  | "thinking"
  | "routing"
  | "scribbling"
  | "celebrate"
  | "slump"
  | "heaven"
  | "hell";

/** Feet-on-the-desk height of the fly's group. */
const STAND_Y = 1.96;
/** How long the trip between the desk and a realm takes, each way. */
const FLIGHT_SECONDS = 1.5;
/** How long the fly is kept in a realm before it heads back on its own. */
const STAY_SECONDS = 4.5;
/** Extra height at mid-flight: a rise toward heaven, a yank and a drop into hell. */
const FLIGHT_ARC: Record<Realm, number> = { heaven: 0.5, hell: 0.7 };

export interface Fly {
  group: THREE.Group;
  setState: (s: FlyState) => void;
  /** Where the fly is on its trip to heaven or hell (for the realms to react to). */
  visit: () => RealmVisit;
  tick: (dt: number, t: number) => void;
}

/** Lathe profile of the body: [radius, y] pairs, y+ = toward the head. */
const BODY_PROFILE: [number, number][] = [
  [0.001, -0.62], // abdomen tip
  [0.1, -0.58],
  [0.17, -0.48],
  [0.21, -0.36],
  [0.225, -0.2],
  [0.215, -0.05],
  [0.19, 0.08], // waist (petiole-ish taper)
  [0.21, 0.2], // thorax bulge
  [0.225, 0.32],
  [0.19, 0.42],
  [0.1, 0.47],
];

/** Dorsal bristles: [x?, no—] stored as (along-body y, side z, height). */
const BRISTLES: Array<[number, number, number]> = [
  [0.3, 0.16, 0.07], [0.3, -0.16, 0.07], [0.16, 0.19, 0.08], [0.16, -0.19, 0.08],
  [0.02, 0.2, 0.08], [0.02, -0.2, 0.08], [-0.14, 0.18, 0.07], [-0.14, -0.18, 0.07],
  [-0.34, 0.14, 0.06], [-0.34, -0.14, 0.06], [-0.5, 0.09, 0.05], [-0.5, -0.09, 0.05],
];

/** Tiny procedural ommatidia normal map: a honeycomb of domed facets. */
function eyeNormalTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const cell = 16;
  ctx.fillStyle = "#8080ff"; // flat normal
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += cell) {
    for (let x = 0; x < 256; x += cell) {
      // radial gradient per facet: normals tilt outward toward the edges
      const g = ctx.createRadialGradient(x + cell / 2, y + cell / 2, 1, x + cell / 2, y + cell / 2, cell / 2);
      g.addColorStop(0, "#8080ff");
      g.addColorStop(1, "#5a5aff");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x + cell / 2, y + cell / 2, cell / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

export function createFly(): Fly {
  const group = new THREE.Group();

  const chitin = new THREE.MeshPhysicalMaterial({
    color: 0x3d434f, roughness: 0.35, metalness: 0.25, clearcoat: 0.7, clearcoatRoughness: 0.35,
  });
  const chitinDark = new THREE.MeshPhysicalMaterial({
    color: 0x242832, roughness: 0.45, metalness: 0.2, clearcoat: 0.5,
  });
  const eyeMat = new THREE.MeshPhysicalMaterial({
    color: 0x9e2b23, roughness: 0.28, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.18,
    emissive: 0x2a0604, emissiveIntensity: 0.55,
    // faceted ommatidia look via a bumpy normal map
    normalMap: eyeNormalTexture(),
  });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2a2e38, roughness: 0.5, metalness: 0.3 });
  const bristleMat = new THREE.MeshStandardMaterial({ color: 0x1c1f27, roughness: 0.6 });
  const wingMat = new THREE.MeshPhysicalMaterial({
    color: 0xd6e9ff, transparent: true, opacity: 0.4, roughness: 0.05,
    metalness: 0.1, side: THREE.DoubleSide, iridescence: 0.75, iridescenceIOR: 1.3,
    clearcoat: 0.8, clearcoatRoughness: 0.2,
  });

  // ── body: lathe profile rotated so +Y (head end) → −X ───────────
  const bodyGroup = new THREE.Group();
  const pts = BODY_PROFILE.map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), chitin);
  bodyGroup.add(body);
  // banding: thin dark rings inset against the abdomen (tergite seams, not hoops)
  for (const y of [-0.5, -0.38, -0.26, -0.14, -0.02]) {
    const r = BODY_PROFILE.reduce((best, [rr, yy]) => (Math.abs(yy - y) < Math.abs(best[1] - y) ? [rr, yy] : best), BODY_PROFILE[0])[0];
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.985, 0.008, 8, 36), chitinDark);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    ring.scale.set(1, 1, 1.06); // oval, hugging the body cross-section
    bodyGroup.add(ring);
  }
  // dorsal bristles
  for (const [y, z, h] of BRISTLES) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.009, h, 5), bristleMat);
    const rAt = BODY_PROFILE.reduce((best, [rr, yy]) => (Math.abs(yy - y) < Math.abs(best[1] - y) ? [rr, yy] : best), BODY_PROFILE[0])[0];
    b.position.set(0, y, z >= 0 ? rAt * 0.92 : -rAt * 0.92);
    b.rotation.x = z >= 0 ? -0.5 : 0.5;
    bodyGroup.add(b);
  }
  bodyGroup.rotation.z = Math.PI / 2; // head end faces −X
  group.add(bodyGroup);

  // ── head ────────────────────────────────────────────────────────
  const head = new THREE.Group();
  head.position.set(-0.44, 0.02, 0);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.165, 28, 22), chitin);
  skull.scale.set(1, 0.95, 0.9);
  head.add(skull);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.115, 24, 18), eyeMat);
    eye.scale.set(0.82, 1.05, 0.88);
    eye.position.set(-0.05, 0.025, sx * 0.115);
    head.add(eye);
  }
  // proboscis
  const proboscis = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.08, 10), chitinDark);
  proboscis.position.set(-0.16, -0.09, 0);
  proboscis.rotation.z = Math.PI / 2 + 0.5;
  head.add(proboscis);
  // antennae: small two-segment feelers (real flies' are tiny), drooping
  const antennae: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const ant = new THREE.Group();
    const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.1, 6), legMat);
    seg1.position.y = 0.05;
    ant.add(seg1);
    const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.08, 6), legMat);
    seg2.position.y = 0.13;
    ant.add(seg2);
    ant.position.set(-0.13, 0.11, sx * 0.05);
    ant.rotation.z = 1.35; // tilt forward-down
    ant.rotation.y = sx * 0.35;
    head.add(ant);
    antennae.push(ant);
  }
  group.add(head);

  // ── legs: coxa → femur → tibia (+ tarsus), bent chains ──────────
  interface Leg {
    root: THREE.Group;
    femur: THREE.Group;
    tibia: THREE.Group;
    side: number;
    row: number;
    tibiaAngle: number;
  }
  const legs: Leg[] = [];
  const ATTACH: [number, number][] = [[-0.06, 0.16], [0.0, 0.17], [0.08, 0.16]]; // [y, z-offset] per row (front/mid/rear), x set below
  const ATTACH_X = [0.3, 0.05, -0.2];
  for (const side of [-1, 1]) {
    for (let row = 0; row < 3; row++) {
      const root = new THREE.Group();
      root.position.set(ATTACH_X[row], ATTACH[row][0], side * ATTACH[row][1]);
      root.rotation.z = side * -0.12;

      // coxa: outward + slightly down
      const coxa = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.018, 0.11, 8), legMat);
      coxa.position.y = 0.055;
      const coxaPivot = new THREE.Group();
      coxaPivot.rotation.x = side * 1.25;
      coxaPivot.add(coxa);
      root.add(coxaPivot);

      // femur: bends further down
      const femur = new THREE.Group();
      femur.position.y = 0.11;
      femur.rotation.x = side * 0.85;
      const femurMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.013, 0.15, 8), legMat);
      femurMesh.position.y = 0.075;
      femur.add(femurMesh);
      coxaPivot.add(femur);

      // tibia: mostly straight down
      const tibia = new THREE.Group();
      tibia.position.y = 0.15;
      // per-row angles: front legs most retracted, rear most extended — keeps
      // all six feet on the desk despite the splayed, insect-like stance
      const tibiaAngle = row === 0 ? 0.55 : row === 1 ? 0.75 : 1.05;
      tibia.rotation.x = side * tibiaAngle;
      const tibiaMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.007, 0.16, 8), legMat);
      tibiaMesh.position.y = 0.08;
      tibia.add(tibiaMesh);
      // tarsus
      const tarsus = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.07, 6), legMat);
      tarsus.position.y = 0.185;
      tibia.add(tarsus);
      femur.add(tibia);

      legs.push({ root, femur, tibia, side, row, tibiaAngle });
      group.add(root);
    }
  }

  // ── wings: swept-back translucent ellipses rooted at the thorax ─
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.bezierCurveTo(0.12, 0.16, -0.55, 0.2, -0.78, 0.06);
  wingShape.bezierCurveTo(-0.92, -0.01, -0.6, -0.14, -0.2, -0.12);
  wingShape.bezierCurveTo(-0.08, -0.11, 0, -0.08, 0, 0);
  const wingGeom = new THREE.ShapeGeometry(wingShape, 20);
  const wings: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const wingRoot = new THREE.Group();
    wingRoot.position.set(-0.02, 0.17, sx * 0.09);
    const wing = new THREE.Mesh(wingGeom, wingMat);
    wing.rotation.x = -Math.PI / 2; // lay the shape into the XZ plane
    wingRoot.add(wing);
    wingRoot.rotation.y = sx * 0.28; // sweep back over the abdomen
    wingRoot.rotation.x = -0.18; // slight raised pitch
    group.add(wingRoot);
    wings.push(wingRoot);
  }

  // halo: worn only in heaven
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.13, 0.015, 8, 28),
    // brighter than 1.0 so the bloom pass makes it glow
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd95a).multiplyScalar(2.2) }),
  );
  halo.rotation.x = Math.PI / 2;
  halo.visible = false;
  group.add(halo);

  // (contact shadow is a real cast shadow now — see scene.ts)

  // ── state machine ───────────────────────────────────────────────
  let state: FlyState = "idle";
  let stateTime = 0;
  let groomTimer = 4;
  let grooming = false;

  // the trip to heaven or hell: the fly owns it, so it always gets home
  const home = new THREE.Vector3();
  let homeYaw = 0;
  let realm: Realm | null = null;
  let travel = 0; // 0 = at the desk … 1 = arrived
  let stay = 0;
  const visitInfo: RealmVisit = { realm: null, presence: 0, stay: 0 };

  function setState(s: FlyState): void {
    // A stay in heaven or hell is a one-shot, so an "idle" nudge from the
    // show resting must not cut it short — the fly comes back on its own.
    // Real work always takes over immediately (and hurries it home).
    if ((state === "heaven" || state === "hell") && s === "idle") return;
    state = s;
    stateTime = 0;
  }

  function tick(dt: number, t: number): void {
    stateTime += dt;

    // at the desk: remember where home is, and pick up a new destination
    if (travel === 0) {
      home.set(group.position.x, STAND_Y, group.position.z);
      homeYaw = group.rotation.y;
      realm = state === "heaven" || state === "hell" ? state : null;
    }
    // outbound only toward the realm it set out for — sent somewhere else
    // mid-trip, it comes home first
    const outbound = realm !== null && state === realm;
    // real work waiting at the desk hurries the trip back
    const rate = outbound ? 1 : state === "idle" ? -1 : -2;
    travel = Math.min(1, Math.max(0, travel + (rate * dt) / FLIGHT_SECONDS));
    stay = travel === 1 ? stay + dt : 0;
    // its time is up: back to waiting, without anyone having to tell it
    if (outbound && stay >= STAY_SECONDS) {
      state = "idle"; // set directly — setState() guards the stay from idle
      stateTime = 0;
    }
    const flying = travel > 0 && travel < 1;
    const arrived = travel === 1 ? realm : null;

    // random idle grooming bouts
    if (state === "idle" || state === "reading") {
      groomTimer -= dt;
      if (groomTimer <= 0) {
        grooming = !grooming;
        groomTimer = grooming ? 2.2 + Math.sin(t * 13) * 0.4 : 5 + Math.sin(t * 7) * 2;
      }
    } else {
      grooming = false;
    }

    const idleBob = Math.sin(t * 2.1) * 0.012;
    group.position.copy(home); // standing height: feet on the desk
    group.rotation.y = homeYaw;
    if (realm) {
      const k = travel * travel * (3 - 2 * travel); // ease out of and into each perch
      group.position.lerp(REALM_PERCH[realm], k);
      group.position.y += Math.sin(travel * Math.PI) * FLIGHT_ARC[realm];
      group.rotation.y = homeYaw + (REALM_YAW[realm] - homeYaw) * k;
    }
    group.position.y += idleBob;

    halo.visible = realm === "heaven" && travel > 0.05;
    if (halo.visible) {
      halo.scale.setScalar(travel);
      halo.position.set(-0.44, 0.33 + Math.sin(t * 2.4) * 0.012, 0);
    }

    // antennae always twitch
    antennae.forEach((ant, i) => {
      const s = i === 0 ? -1 : 1;
      ant.rotation.x = Math.sin(t * 6 + i * 2.4) * 0.12;
      ant.rotation.y = s * (0.35 + Math.sin(t * 4.4 + i) * 0.1);
    });

    // wings: default rest; buzz in flight and during celebrate; droop during slump
    if (flying) {
      wings.forEach((w, i) => {
        const s = i === 0 ? -1 : 1;
        w.rotation.y = s * (0.45 + Math.sin(t * 70 + i) * 0.5);
        w.rotation.x = -0.35 + Math.sin(t * 70 + 0.5) * 0.2;
      });
      // into hell it goes tumbling; everywhere else it flies level
      group.rotation.z = realm === "hell" && state === "hell" ? Math.sin(t * 17) * 0.3 : 0;
    } else if (arrived === "heaven") {
      // bliss: floating over the cloud on slow, easy wingbeats
      wings.forEach((w, i) => {
        const s = i === 0 ? -1 : 1;
        w.rotation.y = s * (0.55 + Math.sin(t * 7 + i) * 0.3);
        w.rotation.x = -0.3 + Math.sin(t * 7 + 0.5) * 0.15;
      });
      group.rotation.z = Math.sin(t * 1.3) * 0.05;
      group.position.y += Math.sin(t * 1.6) * 0.05;
    } else if (arrived === "hell") {
      // punishment: hopping on the hot slab, flinching at every jab
      const poke = pokeStrength(stay);
      wings.forEach((w, i) => {
        const s = i === 0 ? -1 : 1;
        w.rotation.y = s * (0.1 + poke * 0.6);
        w.rotation.x = 0.3 - poke * 0.5;
      });
      group.rotation.z = Math.sin(t * 38) * 0.04 + poke * 0.28; // jabbed rear pops up
      group.position.y += Math.abs(Math.sin(t * 11)) * 0.035 + poke * 0.16;
    } else if (state === "celebrate") {
      wings.forEach((w, i) => {
        const s = i === 0 ? -1 : 1;
        w.rotation.y = s * (0.45 + Math.sin(t * 70 + i) * 0.5);
        w.rotation.x = -0.35 + Math.sin(t * 70 + 0.5) * 0.2;
      });
      group.position.y += Math.abs(Math.sin(t * 30)) * 0.05;
    } else if (state === "slump") {
      wings.forEach((w) => {
        w.rotation.y = (w === wings[0] ? -1 : 1) * 0.05;
        w.rotation.x = 0.35; // drooped flat down
      });
      group.rotation.z = Math.sin(stateTime * 2) * 0.02 - 0.04;
      group.position.y -= 0.03;
    } else {
      wings.forEach((w, i) => {
        const s = i === 0 ? -1 : 1;
        w.rotation.y = s * (0.28 + Math.sin(t * 3 + i) * 0.06);
        w.rotation.x = -0.18 + Math.sin(t * 2 + i) * 0.05;
      });
      group.rotation.z = 0;
    }

    // legs: idle micro-shift / walk-fidget; front-leg rub while grooming
    legs.forEach((leg, i) => {
      const phase = t * 1.8 + i * 1.3;
      let lift = Math.sin(phase) * 0.05;
      if (grooming && leg.row === 0) {
        lift = 0.55 + Math.sin(t * 16 + leg.side * Math.PI / 1.5) * 0.35;
      }
      if (flying) lift = -0.15; // tucked in flight
      else if (arrived === "hell") lift = Math.abs(Math.sin(t * 11 + i * 1.7)) * 0.5; // hot feet
      leg.root.rotation.x = lift;
      leg.femur.rotation.x = leg.side * (0.85 + (grooming && leg.row === 0 ? Math.sin(t * 16) * 0.2 : 0));
      leg.tibia.rotation.x = leg.side * leg.tibiaAngle;
    });

    // state-specific head behavior
    if (state === "reading") {
      head.rotation.y = Math.sin(stateTime * 1.4) * 0.5;
      head.rotation.x = 0.35 + Math.sin(stateTime * 2.2) * 0.05;
    } else if (state === "thinking") {
      head.rotation.y = Math.sin(stateTime * 0.8) * 0.15;
      head.rotation.x = -0.25; // look up at the thought bubble
    } else if (state === "scribbling") {
      head.rotation.x = 0.5;
      legs[0].root.rotation.x = Math.sin(t * 18) * 0.45;
      legs[3].root.rotation.x = Math.sin(t * 18 + 1) * 0.45;
    } else if (state === "routing") {
      head.rotation.x = -0.4;
      legs.forEach((leg) => (leg.root.rotation.x = -0.15));
    } else if (state === "heaven") {
      // gazing up, serene
      head.rotation.set(-0.3 + Math.sin(stateTime * 1.1) * 0.05, Math.sin(stateTime * 0.9) * 0.25, 0);
    } else if (state === "hell") {
      // looking around frantically for a way out
      head.rotation.set(0.25, Math.sin(stateTime * 13) * 0.4, 0);
    } else if (state === "idle") {
      head.rotation.set(0, Math.sin(t * 0.6) * 0.2, 0);
    }
  }

  function visit(): RealmVisit {
    visitInfo.realm = realm;
    visitInfo.presence = travel;
    visitInfo.stay = stay;
    return visitInfo;
  }

  return { group, setState, visit, tick };
}
