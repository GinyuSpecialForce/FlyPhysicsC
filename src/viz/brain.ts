/**
 * The desk hologram: the anatomical fly brain (shared builder in
 * flyBrain.ts) floating over the desk, rendered as translucent light —
 * fresnel rims, scanlines, wireframe structure. Regions glow when their
 * pipeline stage runs and pulses travel the tract between stages.
 */
import * as THREE from "three";
import { buildFlyBrain, GROUP_TONE } from "./flyBrain";

export interface BrainHolo {
  group: THREE.Group;
  /** light up a region by stage id; "off" dims everything */
  activate: (stage: string) => void;
  setBeat: (p: number) => void;
  tick: (dt: number, t: number) => void;
}

/**
 * Hologram shell shader: fresnel rim + latitude scanlines, additive.
 * One material per region mesh; uIntensity drives the glow per frame.
 */
function holoMaterial(color: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color.clone() },
      uIntensity: { value: 0.35 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - wp.xyz);
        vPos = position;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vPos;
      void main() {
        float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewDir))), 2.2);
        float scan = 0.82 + 0.18 * sin(vPos.y * 60.0 + uTime * 3.0);
        float shimmer = 0.94 + 0.06 * sin(uTime * 7.0 + vPos.x * 20.0);
        float a = (0.10 + fres * 0.85) * uIntensity * scan * shimmer;
        vec3 col = mix(uColor, vec3(1.0), fres * 0.55);
        gl_FragColor = vec4(col * a, a);
        if (gl_FragColor.a < 0.01) discard;
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export function createBrainHolo(): BrainHolo {
  const group = new THREE.Group();

  // The anatomical brain, holo-styled: each region's standard material is
  // swapped for the shader; a matching wireframe gives it structure.
  const built = buildFlyBrain({ physical: false });
  const brain = built.group;
  group.add(brain);

  const shells: { mat: THREE.ShaderMaterial; intensity: number }[] = [];
  for (const r of built.regions) {
    const std = r.mesh.material as THREE.MeshStandardMaterial;
    r.mesh.material = holoMaterial(std.emissive ?? new THREE.Color(GROUP_TONE[r.group] ?? 0x8fb0ff));
    shells.push({ mat: r.mesh.material as THREE.ShaderMaterial, intensity: 0.35 });

    // wireframe structure on named regions only — wiring every unnamed
    // sub-part stacks hundreds of additive lines into visual mush
    if (r.name) {
      const big = r.name === "Central brain";
      const wireMat = new THREE.MeshBasicMaterial({
        color: GROUP_TONE[r.group] ?? 0x8fb0ff,
        wireframe: true,
        transparent: true,
        opacity: big ? 0.04 : 0.07,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      r.mesh.add(new THREE.Mesh(r.mesh.geometry, wireMat)); // child: inherits transform
    }
  }

  // faint blue halo disc under the brain (projection base)
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(0.85, 40),
    new THREE.MeshBasicMaterial({ color: 0x3a6cff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  halo.rotation.x = -Math.PI / 2;
  group.add(halo);

  let activeStage = "";
  let beat = 0;

  function activate(stage: string): void {
    if (stage === activeStage) return;
    activeStage = stage;
    built.activate(stage); // drives the traveling pulses
  }

  function setBeat(p: number): void {
    beat = p;
  }

  function tick(dt: number, t: number): void {
    built.tick(dt, t); // pulses (its material loop is a no-op here)
    // drive shader glow per region, easing like the atlas does
    built.regions.forEach((r, i) => {
      const active = r.stage !== null && r.stage === activeStage;
      const target = active ? 1.0 + 0.5 * (0.5 + 0.5 * Math.sin(t * 7 + r.mesh.position.x * 4)) : 0.35;
      shells[i].intensity += (target - shells[i].intensity) * Math.min(1, dt * 6);
      shells[i].mat.uniforms.uIntensity.value = shells[i].intensity;
      shells[i].mat.uniforms.uTime.value = t;
    });
    if (activeStage === "answer") {
      const flash = Math.max(0, 1 - beat);
      group.scale.setScalar(1.15 * (1 + flash * 0.12));
    }
    // gentle hologram float
    group.rotation.y = Math.sin(t * 0.4) * 0.22;
    group.position.y = 3.6 + Math.sin(t * 0.9) * 0.07;
  }

  return { group, activate, setBeat, tick };
}
