import type { EditableSlideScene, VisualBounds, VisualText } from './presentation-visual-layout.js';

export type ReviewText = Omit<VisualText, 'role'> & {
  role: VisualText['role'] | 'node-label' | 'branch-label' | 'stage-label' | 'stage-detail';
  align?: 'left' | 'center';
  sourceId?: string;
};
export type ReviewShape = {
  id: string; kind: 'shape'; sourceId: string; geometry: 'rect' | 'roundRect' | 'diamond';
  bounds: VisualBounds; fill: string; stroke: string; strokeWidthPt: number;
};
export type ReviewConnector = {
  id: string; kind: 'connector'; sourceId: string; points: { x: number; y: number }[];
  stroke: string; strokeWidthPt: number;
};
export type ReviewChart = {
  id: string; kind: 'chart'; bounds: VisualBounds; labels: string[];
  series: { name: string; values: number[] }[]; unit: string;
  /** Office lays out native chart axes/bars. Only this outer frame is measured here. */
  internalGeometry: 'office';
};
export type StructuredSlideScene = {
  schemaVersion: 1; layoutVersion: 'structured-v1'; slideId: string;
  slideType: 'process' | 'flowchart' | 'chart'; semanticFingerprint: string;
  width: number; height: number; background: string; theme: 'blue' | 'light' | 'dark';
  elements: (ReviewText | ReviewShape | ReviewConnector | ReviewChart)[];
  readingOrder: string[];
  branches?: { edgeId: string; label: string; lane: 'left' | 'right'; nodeIds: string[] }[];
};
export type SavedSlideScene = EditableSlideScene | StructuredSlideScene;
export type PresentationSceneResponse = {
  projectId: string; revision: number; sha256: string; scenes: SavedSlideScene[];
  evidence: 'saved-export';
};
