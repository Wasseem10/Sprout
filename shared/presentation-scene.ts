/** Measured, renderer-independent inches/points. No provider-authored coordinates. */
export type ScenePoint = { x: number; y: number };
export type SceneBounds = ScenePoint & { width: number; height: number };
export type SceneFont = { family: 'Arial'; sizePt: number; bold: boolean; color: string };
type SceneIdentity = { id: string; sourceId?: string; readingOrder: number };
export type PresentationSceneText = SceneIdentity & {
  kind: 'text';
  role: 'title' | 'node-label' | 'branch-label';
  bounds: SceneBounds;
  text: string;
  /** Already wrapped using the declared font. Consumers must not reflow or shrink. */
  lines: { text: string; width: number }[];
  lineHeight: number;
  font: SceneFont;
  align: 'left' | 'center';
  verticalAlign: 'middle';
  hostShapeId?: string;
};
export type PresentationSceneShape = SceneIdentity & {
  kind: 'shape';
  role: 'start' | 'process' | 'decision' | 'end';
  geometry: 'rect' | 'roundRect' | 'diamond';
  bounds: SceneBounds;
  fill: string;
  stroke: string;
  strokeWidthPt: number;
  labelId: string;
};
export type PresentationSceneConnector = SceneIdentity & {
  kind: 'connector';
  role: 'flow';
  sourceId: string;
  fromNodeId: string;
  toNodeId: string;
  points: ScenePoint[];
  stroke: string;
  strokeWidthPt: number;
  arrowhead: 'triangle';
  /** Reserved physical envelope for an exporter arrow head, in inches. */
  arrowheadSize: number;
  labelId?: string;
};
export type PresentationSceneElement =
  PresentationSceneText | PresentationSceneShape | PresentationSceneConnector;
export type PresentationScene = {
  schemaVersion: 1;
  slideId: string;
  width: number;
  height: number;
  background: string;
  bodyBounds: SceneBounds;
  titleBounds: SceneBounds;
  footerTop: number;
  /** Arial is the declared fallback for all consumers, and is measured explicitly. */
  fontPolicy: { family: 'Arial'; fallback: 'Arial'; metrics: '@napi-rs/canvas'; dpi: 96 };
  elements: PresentationSceneElement[];
  readingOrder: string[];
  flowchart: {
    startNodeId: string;
    decisionNodeId: string;
    commonNodeIds: string[];
    branches: {
      edgeId: string;
      label: string;
      lane: 'left' | 'right';
      nodeIds: string[];
      edgeIds: string[];
    }[];
    mergeNodeId?: string;
    sharedNodeIds: string[];
  };
};
