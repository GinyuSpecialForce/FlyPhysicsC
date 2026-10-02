/**
 * Camera director: desk cam (default), brain cam (close-up on the hologram),
 * an auto mode that eases between them as pipeline stages change, and an
 * orbit mode where the user drags freely (OrbitControls owns the camera;
 * the director just watches so handing control back eases smoothly).
 */
import * as THREE from "three";

export type CamMode = "desk" | "brain" | "auto" | "orbit";

const tmpDir = new THREE.Vector3();

// Framed closer than before so the fly is the hero of the desk shot, with
// the lamp still visible at frame-left for context.
const DESK_POS = new THREE.Vector3(0.4, 2.6, 5.9);
const DESK_LOOK = new THREE.Vector3(0.5, 2.1, 0.5);
const BRAIN_POS = new THREE.Vector3(0.6, 4.1, 2.6);
const BRAIN_LOOK = new THREE.Vector3(0, 3.6, 0.2);

const STAGE_CAMS: Record<string, { pos: THREE.Vector3; look: THREE.Vector3 }> = {
  encode: { pos: new THREE.Vector3(1.8, 2.4, 5.6), look: new THREE.Vector3(0.4, 1.7, 0.4) },
  classify: { pos: new THREE.Vector3(0.9, 4.3, 2.4), look: new THREE.Vector3(0, 3.6, 0.2) },
  route: { pos: new THREE.Vector3(-1.4, 4.0, 2.8), look: new THREE.Vector3(0, 3.5, 0.1) },
  compute: { pos: new THREE.Vector3(0.3, 3.2, 3.4), look: new THREE.Vector3(0, 2.6, 0.3) },
  answer: { pos: DESK_POS.clone(), look: DESK_LOOK.clone() },
};

export class CameraDirector {
  mode: CamMode = "auto";
  private pos = DESK_POS.clone();
  private look = DESK_LOOK.clone();
  private targetPos = DESK_POS.clone();
  private targetLook = DESK_LOOK.clone();

  setMode(mode: CamMode): void {
    this.mode = mode;
  }

  notifyStage(stage: string): void {
    if (this.mode !== "auto") return;
    const c = STAGE_CAMS[stage];
    if (c) {
      this.targetPos.copy(c.pos);
      this.targetLook.copy(c.look);
    }
  }

  tick(dt: number, camera: THREE.PerspectiveCamera): void {
    if (this.mode === "orbit") {
      // user-controlled: track the camera so re-entering a preset eases
      // from wherever the user left the view instead of snapping
      this.pos.copy(camera.position);
      camera.getWorldDirection(tmpDir);
      this.look.copy(camera.position).addScaledVector(tmpDir, 3);
      return;
    }
    if (this.mode === "desk") {
      this.targetPos.copy(DESK_POS);
      this.targetLook.copy(DESK_LOOK);
    } else if (this.mode === "brain") {
      this.targetPos.copy(BRAIN_POS);
      this.targetLook.copy(BRAIN_LOOK);
    }
    const ease = 1 - Math.exp(-dt * 2.4);
    this.pos.lerp(this.targetPos, ease);
    this.look.lerp(this.targetLook, ease);
    camera.position.copy(this.pos);
    camera.lookAt(this.look);
  }
}
