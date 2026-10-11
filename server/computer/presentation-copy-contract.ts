import type { OrderedPresentationSlide } from '../../shared/presentation-deck.js';
import type { InferenceOutputSchema } from '../../shared/inference-schema.js';

/** Structural contract only. It cannot prove semantic faithfulness of rewritten prose. */
export function presentationCopyContract(
  slide: OrderedPresentationSlide,
  preserveProcess: boolean,
): InferenceOutputSchema {
  const string = (maxLength: number, minLength = 1) => ({ type: 'string', minLength, maxLength });
  const object = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
  const array = (items: unknown, minItems: number, maxItems: number) => ({ type: 'array', items, minItems, maxItems });
  const properties: Record<string, unknown> = { title: string(100) };
  if (slide.type === 'cover') properties.subtitle = string(220, 0);
  if (slide.type === 'text' || slide.type === 'image' && slide.layout === 'split')
    properties.points = array(string(240), 1, 5);
  if (slide.type === 'image') properties.caption = string(220, 0);
  if (slide.type === 'process') properties.stages = array(object({
    ...(preserveProcess ? { stageId: { type: 'string', enum: slide.stages.map((_, i) => `stage-${i + 1}`) } } : {}),
    label: string(40), detail: string(160),
  }), preserveProcess ? slide.stages.length : 3, preserveProcess ? slide.stages.length : 5);
  return { name: 'PresentationCopy', schema: object(properties) };
}

/** Expansion adds one explanation without rewriting any original claim. */
export function presentationAdditionContract(pointCount: number): InferenceOutputSchema {
  return { name: 'PresentationAddition', schema: {
    type: 'object', additionalProperties: false, required: ['afterPoint', 'explanation'],
    properties: {
      afterPoint: { type: 'integer', minimum: 0, maximum: pointCount - 1 },
      explanation: { type: 'string', minLength: 1, maxLength: 240 },
    },
  } };
}
