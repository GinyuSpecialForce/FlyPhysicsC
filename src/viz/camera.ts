/**
 * Camera director: free orbit (default — the user drags wherever they like),
 * plus two presets — desk cam and a close-up on the hologram.
 *
 * In orbit mode OrbitControls owns the camera and the director just watches,
 * so handing control to a preset eases in from wherever the user left the view
 * instead of snapping.
 */
import * as THREE from "three";

export type CamMode = "desk" | "brain" | "orbit";

const tmpDir = new THREE.Vector3();

// Framed closer than before so the fly is the hero of the desk shot, with
// the lamp still visible at frame-left for context.
const DESK_POS = new THREE.Vector3(0.4, 2.6, 5.9);
const DESK_LOOK = new THREE.Vector3(0.5, 2.1, 0.5);
const BRAIN_POS = new THREE.Vector3(0.6, 4.1, 2.6);
const BRAIN_LOOK = new THREE.Vector3(0, 3.6, 0.2);

export class CameraDirector {
  mode: CamMode = "orbit";
  private pos = DESK_POS.clone();
  private look = DESK_LOOK.clone();
  private targetPos = DESK_POS.clone();
  private targetLook = DESK_LOOK.clone();

  setMode(mode: CamMode): void {
    this.mode = mode;
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
