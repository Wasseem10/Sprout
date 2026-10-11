import { z } from 'zod';
import type { PictureDeck } from './presentation-project.js';
import { flowchartSchema, narrateFlowchart } from './presentation-flowchart.js';
import { verifiedChartSnapshotSchema } from './presentation-chart-snapshot.js';

const base = {
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  title: z.string().trim().min(1).max(100),
  textScale: z.number().min(0.9).max(1.35).optional(),
};
const visualBase = { ...base, titleScale: z.number().min(0.9).max(1.3).optional() };
const points = z.array(z.string().trim().min(1).max(240)).min(1).max(5);
export const orderedChartSchema = z
  .strictObject({
    labels: z.array(z.string().min(1).max(60).refine(value => !!value.trim())).min(1).max(12),
    series: z
      .array(
        z.strictObject({
          name: z.string().min(1).max(70).refine(value => !!value.trim()),
          values: z.array(z.number().finite()).min(1).max(12),
        }),
      )
      .min(1)
      .max(4),
    unit: z.string().trim().min(1).max(40),
    provenance: z.strictObject({
      datasetId: z.string().min(1).max(160),
      revision: z.number().int().min(0),
      verifiedAt: z.string().datetime(),
      provider: z.enum(['databricks', 'local']),
      queryRef: z.string().max(250).optional(),
      summary: z.string().min(1).max(1000),
    }),
    verifiedSnapshot: verifiedChartSnapshotSchema.optional(),
  })
  .superRefine((chart, ctx) => {
    if (chart.series.some((series) => series.values.length !== chart.labels.length))
      ctx.addIssue({
        code: 'custom',
        path: ['series'],
        message: 'Every chart series must match the labels exactly.',
      });
    const snapshot = chart.verifiedSnapshot;
    if (snapshot && (
      JSON.stringify(chart.labels) !== JSON.stringify(snapshot.categories)
      || chart.series.length !== 2
      || chart.series.some((series, i) => series.name !== snapshot.series[i].label
        || JSON.stringify(series.values) !== JSON.stringify(snapshot.series[i].valuesCents.map(value => value / 100)))
      || chart.unit !== snapshot.analysis.unit
      || chart.provenance.provider !== 'databricks'
      || chart.provenance.datasetId !== snapshot.dataset.id
      || chart.provenance.revision !== snapshot.analysis.revision
      || chart.provenance.verifiedAt !== snapshot.verification.verifiedAt
      || chart.provenance.queryRef !== snapshot.verification.statementId
    )) ctx.addIssue({ code: 'custom', message: 'Chart values and provenance must equal their saved verified snapshot.' });
  });
export type OrderedPresentationChart = z.infer<typeof orderedChartSchema>;
export const orderedPresentationSlideSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...visualBase,
    type: z.literal('cover'),
    subtitle: z.string().trim().max(220),
    imageId: z.number().int().min(1).max(6).optional(),
    imageDescription: z.string().trim().min(5).max(500).optional(),
  }),
  z.strictObject({ ...visualBase, type: z.literal('text'), points, layout: z.enum(['single', 'two-column']).optional() }),
  z.strictObject({
    ...visualBase,
    type: z.literal('image'),
    imageId: z.number().int().min(1).max(6),
    caption: z.string().trim().max(220),
    points: points.optional(),
    layout: z.enum(['split', 'large']),
    imageSide: z.enum(['left', 'right']).optional(),
    imageDescription: z.string().trim().min(5).max(500).optional(),
  }),
  z.strictObject({
    ...base,
    type: z.literal('process'),
    stages: z
      .array(
        z.strictObject({
          label: z.string().trim().min(1).max(40),
          detail: z.string().trim().min(1).max(160),
        }),
      )
      .min(3)
      .max(5),
  }),
  z.strictObject({ ...base, type: z.literal('chart'), chart: orderedChartSchema }),
  z.strictObject({ ...base, type: z.literal('flowchart'), graph: flowchartSchema }),
]);
export type OrderedPresentationSlide = z.infer<typeof orderedPresentationSlideSchema>;
export const orderedPresentationDeckSchema = z
  .strictObject({
    schemaVersion: z.literal(2),
    title: z.string().trim().min(1).max(100),
    theme: z.enum(['blue', 'light', 'dark']),
    textScale: z.number().min(0.9).max(1.35).default(1),
    allowImageReuse: z.boolean().default(false),
    slides: z.array(orderedPresentationSlideSchema).min(3).max(10),
  })
  .superRefine((deck, ctx) => {
    if (new Set(deck.slides.map((slide) => slide.id)).size !== deck.slides.length)
      ctx.addIssue({
        code: 'custom',
        path: ['slides'],
        message: 'Each slide needs a stable unique ID.',
      });
    const images = deck.slides.flatMap((slide) =>
      'imageId' in slide && slide.imageId !== undefined ? [slide.imageId] : [],
    );
    if (!deck.allowImageReuse && new Set(images).size !== images.length)
      ctx.addIssue({
        code: 'custom',
        path: ['slides'],
        message: 'Repeat an image only when explicitly requested.',
      });
  });
export type OrderedPresentationDeck = z.infer<typeof orderedPresentationDeckSchema>;

export function validateOrderedSources(deck: OrderedPresentationDeck, sourceIds: number[]): void {
  const ids = new Set(sourceIds);
  if (
    deck.slides.some(
      (slide) => 'imageId' in slide && slide.imageId !== undefined && !ids.has(slide.imageId),
    )
  )
    throw new Error('The presentation refers to a source picture that is not available.');
}

export function orderedSlideText(slide: OrderedPresentationSlide): string[] {
  if (slide.type === 'cover') return [slide.title, slide.subtitle].filter(Boolean);
  if (slide.type === 'text') return [slide.title, ...slide.points];
  if (slide.type === 'image')
    return [slide.title, ...(slide.points ?? []), slide.caption].filter(Boolean);
  if (slide.type === 'process')
    return [slide.title, ...slide.stages.flatMap((stage) => [stage.label, stage.detail])];
  if (slide.type === 'flowchart') return [slide.title, narrateFlowchart(slide.graph)];
  return [
    slide.title,
    slide.chart.provenance.summary,
    ...slide.chart.series.flatMap((series) =>
      slide.chart.labels.map(
        (label, index) => `${series.name}: ${label}, ${series.values[index]} ${slide.chart.unit}`,
      ),
    ),
  ];
}

/** Stable deterministic IDs keep old saved projects readable without re-planning them. */
export function toOrderedDeck(legacy: PictureDeck): OrderedPresentationDeck {
  return orderedPresentationDeckSchema.parse({
    schemaVersion: 2,
    title: legacy.title,
    theme: legacy.theme ?? 'blue',
    textScale: 1,
    allowImageReuse: false,
    slides: [
      { id: 'legacy-cover', type: 'cover', title: legacy.title, subtitle: legacy.subtitle },
      ...legacy.slides.map((slide, index) => ({
        id: `legacy-image-${index + 1}`,
        type: 'image',
        title: slide.title,
        points: slide.points,
        imageId: slide.imageId,
        caption: '',
        layout: 'split',
      })),
      {
        id: 'legacy-process',
        type: 'process',
        title: legacy.diagram.title,
        stages: legacy.diagram.stages,
      },
    ],
  });
}

/** Compatibility display only. Ordered slides remain authoritative for rendering and edits. */
export function legacyDeckProjection(deck: OrderedPresentationDeck): PictureDeck {
  const process = deck.slides.find((slide) => slide.type === 'process');
  const cover = deck.slides.find((slide) => slide.type === 'cover');
  const seen = new Set<number>();
  const images = deck.slides.flatMap((slide) => {
    if (!('imageId' in slide) || slide.imageId === undefined || seen.has(slide.imageId)) return [];
    seen.add(slide.imageId);
    const text = slide.type === 'image' ? (slide.points ?? [slide.caption]) : [slide.subtitle];
    const usable = text
      .filter((point) => point.length >= 3)
      .map((point) => point.slice(0, 125))
      .slice(0, 3);
    while (usable.length < 2)
      usable.push(
        usable.length
          ? 'Image supplied for this presentation.'
          : slide.title.padEnd(3, '.').slice(0, 125),
      );
    return [
      { title: slide.title.padEnd(3, '.').slice(0, 65), imageId: slide.imageId, points: usable },
    ];
  });
  return {
    title: deck.title.padEnd(3, '.').slice(0, 75),
    subtitle: (cover?.subtitle || deck.title).padEnd(3, '.').slice(0, 125),
    theme: deck.theme,
    slides: images,
    diagram: process
      ? {
          title: process.title.padEnd(3, '.').slice(0, 65),
          stages: process.stages.map((stage) => ({
            label: stage.label.padEnd(2, '.').slice(0, 32),
            detail: stage.detail.padEnd(3, '.').slice(0, 95),
          })),
        }
      : {
          title: 'Presentation overview',
          stages: deck.slides.slice(0, 3).map((slide) => ({
            label: slide.title.padEnd(2, '.').slice(0, 32),
            detail: orderedSlideText(slide).slice(1).join(' ').slice(0, 95).padEnd(3, '.'),
          })),
        },
  };
}
