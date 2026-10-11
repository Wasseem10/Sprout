import type { NativePptxSlide } from './presentation-pptx-types.js';
import {
  orderedPresentationSlideSchema,
  type OrderedPresentationDeck,
  type OrderedPresentationSlide,
} from '../../shared/presentation-deck.js';
import { layoutFlowchart } from './presentation-flowchart-layout.js';
import {
  finalizeFlowchartPptx,
  renderFlowchartScene,
  type FlowchartRenderReceipt,
} from './presentation-flowchart-render.js';

export type OrderedFlowchartSlide = Extract<OrderedPresentationSlide, { type: 'flowchart' }>;
type DeckStyle = Pick<OrderedPresentationDeck, 'theme' | 'textScale'>;

/** Always derive geometry and narration from the authoritative graph. Scenes are not saved. */
export function prepareOrderedFlowchart(slide: OrderedFlowchartSlide, style: DeckStyle) {
  const parsed = orderedPresentationSlideSchema.parse(slide);
  if (parsed.type !== 'flowchart') throw new Error('A flowchart slide is required.');
  return layoutFlowchart(parsed.graph, {
    slideId: parsed.id,
    title: parsed.title,
    theme: style.theme,
    textScale: parsed.textScale ?? style.textScale,
  });
}

export function renderOrderedFlowchart(
  slide: NativePptxSlide,
  content: OrderedFlowchartSlide,
  style: DeckStyle,
): FlowchartRenderReceipt {
  return renderFlowchartScene(slide, prepareOrderedFlowchart(content, style));
}

/** Finalize native object descriptors after the complete mixed deck is written. */
export const finalizeOrderedFlowcharts = finalizeFlowchartPptx;
export type { FlowchartRenderReceipt };
