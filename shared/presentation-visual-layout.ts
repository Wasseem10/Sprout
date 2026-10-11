import type { OrderedPresentationSlide } from './presentation-deck.js';

export type EditableVisualSlide = Extract<OrderedPresentationSlide, { type: 'cover' | 'text' | 'image' }>;
export type PresentationLayoutChoice = 'single' | 'two-column' | 'image-left' | 'image-right' | 'large-image';
export type VisualBounds = { x: number; y: number; width: number; height: number };
export type VisualText = {
  id: string;
  kind: 'text';
  role: 'title' | 'subtitle' | 'body' | 'caption' | 'marker';
  text: string;
  bounds: VisualBounds;
  fontSize: number;
  bold: boolean;
  color: string;
  lines: { text: string; width: number }[];
  lineHeight: number;
  /** Markers are visual decoration; paragraphs define the spoken reading order. */
  readingOrder?: number;
  pointIndex?: number;
  column?: 'left' | 'right';
};
export type VisualImage = {
  id: string;
  kind: 'image';
  imageId: number;
  /** Contain within this box, preserving the original aspect ratio. */
  bounds: VisualBounds;
  readingOrder: number;
  side: 'left' | 'right' | 'full';
};
export type EditableSlideScene = {
  schemaVersion: 1;
  layoutVersion: 'editable-v1';
  slideId: string;
  slideType: EditableVisualSlide['type'];
  semanticFingerprint: string;
  contentFingerprint: string;
  width: number;
  height: number;
  background: string;
  theme: 'blue' | 'light' | 'dark';
  layout: 'cover' | 'single' | 'two-column' | 'split' | 'large';
  fontPolicy: { family: 'Arial'; fallback: 'Arial'; metrics: '@napi-rs/canvas'; dpi: 96 };
  elements: (VisualText | VisualImage)[];
  readingOrder: string[];
};
export type VisualLayoutFinding = {
  code: 'bounds' | 'overlap' | 'text_fit' | 'contrast' | 'reading_order';
  elementIds: string[];
  message: string;
};
/** Supplied only after the caller checks the committed file against its output hash. */
export type VisualReadbackEvidence = {
  outputMatches: boolean;
  nativeSlideVerified?: boolean;
};
