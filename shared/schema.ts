import { z } from 'zod';

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + 'T00:00:00Z');
    return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === v;
  }, 'Use a real ISO calendar date (YYYY-MM-DD).');
export const rowSchema = z
  .object({
    date: isoDate,
    location_id: z.string().min(1).max(80),
    region: z.string().min(1).max(80),
    revenue: z
      .number()
      .finite()
      .min(-1e8)
      .max(1e8)
      .refine(
        (v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.0001,
        'Revenue must have at most two decimal places.',
      ),
    operating_start: isoDate,
    operating_end: isoDate.nullable(),
  })
  .strict();
export type DataRow = z.infer<typeof rowSchema>;
export const datasetSchema = z
  .object({
    id: z.string().max(100),
    name: z.string().min(1).max(160),
    synthetic: z.boolean(),
    rows: z.array(rowSchema).min(1).max(5000),
  })
  .strict();
export type Dataset = z.infer<typeof datasetSchema>;
export const periodSchema = z
  .object({ label: z.string().max(80), start: isoDate, end: isoDate })
  .strict()
  .refine((p) => p.start <= p.end, 'Period start must precede its end.');
export type Period = z.infer<typeof periodSchema>;
export const comparisonSchema = z
  .object({ previous: periodSchema, current: periodSchema, commonLocations: z.boolean() })
  .strict()
  .refine(
    (c) => c.previous.end < c.current.start,
    'Comparison periods must be ordered and non-overlapping.',
  );
export type Comparison = z.infer<typeof comparisonSchema>;
export const regionalSchema = z.object({
  region: z.string(),
  previous: z.number().finite(),
  current: z.number().finite(),
  delta: z.number().finite(),
  percent: z.number().finite().nullable(),
  rowCount: z.number().int().nonnegative(),
});
export const resultSchema = z.object({
  id: z.string(),
  datasetId: z.string(),
  datasetVersion: z.string(),
  provider: z.enum(['local-sample', 'databricks']),
  comparison: comparisonSchema,
  regions: z.array(regionalSchema).max(50),
  previousTotal: z.number().finite(),
  currentTotal: z.number().finite(),
  percent: z.number().finite().nullable(),
  includedRows: z.number().int().nonnegative(),
  includedLocations: z.number().int().nonnegative(),
  excludedLocations: z.number().int().nonnegative(),
  queryReference: z.string(),
  calculation: z.string(),
  createdAt: z.string(),
});
export type AnalysisResult = z.infer<typeof resultSchema>;
export const viewSchema = z
  .object({
    kind: z.enum(['overview', 'chart', 'table', 'calculation']),
    topN: z.number().int().min(1).max(50).nullable(),
  })
  .strict();
export const workspaceSchema = z
  .object({
    moduleId: z.literal('data'),
    schemaVersion: z.literal(1),
    title: z.string().max(160),
    dataset: datasetSchema.nullable(),
    result: resultSchema.nullable(),
    view: viewSchema,
    projectId: z.string().uuid().nullable(),
  })
  .strict();
export type Workspace = z.infer<typeof workspaceSchema>;
export const emptyWorkspace = (): Workspace => ({
  moduleId: 'data',
  schemaVersion: 1,
  title: 'Untitled workspace',
  dataset: null,
  result: null,
  view: { kind: 'overview', topN: null },
  projectId: null,
});
export const toolNames = [
  'inspectDataset',
  'compareRevenue',
  'refineComparison',
  'createChart',
  'updateChart',
  'describeChart',
  'explainCalculation',
  'describeChanges',
  'undoChange',
  'saveProject',
  'resumeProject',
] as const;
export const actionSchema = z
  .object({
    tool: z.enum(toolNames),
    args: z
      .object({
        commonLocations: z.boolean().optional(),
        topN: z.number().int().min(1).max(50).nullable().optional(),
        comparison: comparisonSchema.optional(),
        projectId: z.string().uuid().optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((a, ctx) => {
    const allowed: Record<string, string[]> = {
      compareRevenue: ['comparison'],
      refineComparison: ['commonLocations', 'comparison'],
      updateChart: ['topN'],
      resumeProject: ['projectId'],
    };
    for (const key of Object.keys(a.args))
      if (!(allowed[a.tool] ?? []).includes(key))
        ctx.addIssue({ code: 'custom', message: `${key} is not supported by ${a.tool}.` });
  });
export type Action = z.infer<typeof actionSchema>;
export const planSchema = z
  .object({ actions: z.array(actionSchema).max(4), clarification: z.string().max(500).nullable() })
  .strict()
  .refine(
    (p) => p.actions.length > 0 || !!p.clarification,
    'A plan needs an action or clarification.',
  )
  .refine(
    (p) => !p.clarification || p.actions.length === 0,
    'A clarification cannot also perform actions.',
  )
  .refine(
    (p) =>
      p.actions.length <= 1 ||
      !p.actions.some((a) => ['undoChange', 'resumeProject', 'saveProject'].includes(a.tool)),
    'Save, resume, and undo must be standalone requests.',
  );
export type Plan = z.infer<typeof planSchema>;
export type SourceReference = { label: string; reference: string };
export const preferencesSchema = z
  .object({ speechEnabled: z.boolean(), largeText: z.boolean(), reducedMotion: z.boolean() })
  .strict();
export type Preferences = z.infer<typeof preferencesSchema>;
export const taskMetadataSchema = z
  .object({
    phase: z.enum(['ready', 'cancelled', 'error']),
    detail: z.string().max(2000),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type TaskMetadata = z.infer<typeof taskMetadataSchema>;
export type ToolResult = {
  summary: string;
  state: Workspace;
  references: SourceReference[];
  changed: boolean;
  historyOperation?: 'undo' | 'restore';
  history?: Workspace[];
  preferences?: Preferences;
  lastTask?: TaskMetadata;
};
export type Progress = {
  phase: 'thinking' | 'working' | 'ready' | 'cancelled' | 'error';
  detail: string;
};
export const blankHistory = z.array(workspaceSchema).max(20);
export const projectSchema = z
  .object({
    state: workspaceSchema,
    history: blankHistory,
    preferences: preferencesSchema.optional(),
    lastTask: taskMetadataSchema.optional(),
  })
  .strict();
export type Project = z.infer<typeof projectSchema>;
