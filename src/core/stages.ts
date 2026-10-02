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
  { id: "encode", label: "Encoding", region: "Optic lobe", color: "#7fd4ff" },
  { id: "classify", label: "Classifying", region: "Mushroom bodies", color: "#7fa0e6" },
  { id: "route", label: "Routing", region: "Central complex", color: "#ffd166" },
  { id: "compute", label: "Computing", region: "Motor circuits", color: "#8dffb0" },
  { id: "answer", label: "Answering", region: "Legs + pencil", color: "#e6d9a8" },
];
