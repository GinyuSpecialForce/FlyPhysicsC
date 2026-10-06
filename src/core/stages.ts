/**
 * Pipeline stage ids and metadata, shared by brain, timeline UI, and 3D scene.
 */

export type StageId = "encode" | "classify" | "route" | "compute" | "answer";

export interface StageInfo {
  id: StageId;
  label: string;
  region: string;
  color: string;
}

export const STAGES: StageInfo[] = [
  // stage tones: a graphite ramp on dark — later stages brighten toward white
  { id: "encode", label: "Encoding", region: "Optic lobe", color: "#94949c" },
  { id: "classify", label: "Classifying", region: "Mushroom bodies", color: "#a2a2aa" },
  { id: "route", label: "Routing", region: "Central complex", color: "#b4b4bc" },
  { id: "compute", label: "Computing", region: "Motor circuits", color: "#c8c8d0" },
  { id: "answer", label: "Answering", region: "Legs + pencil", color: "#f0f0f5" },
];
