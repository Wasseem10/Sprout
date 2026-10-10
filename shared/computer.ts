import { z } from 'zod';

export const computerActionSchema = z.discriminatedUnion('tool', [
  z
    .object({
      tool: z.literal('createCode'),
      request: z.string().min(1).max(2000),
      run: z.boolean().optional(),
      openEditor: z.boolean().optional(),
    })
    .strict(),
  z.object({ tool: z.literal('runCode') }).strict(),
  z.object({ tool: z.literal('openEditor') }).strict(),
  z
    .object({
      tool: z.literal('createPresentation'),
      request: z.string().min(1).max(2000),
      slides: z.number().int().min(3).max(6).optional(),
      open: z.boolean().optional(),
    })
    .strict(),
  z.object({ tool: z.literal('openPresentation') }).strict(),
  z
    .object({
      tool: z.literal('analyzeSpreadsheet'),
      question: z.string().min(1).max(1000),
      filename: z.string().max(160).optional(),
      open: z.boolean().optional(),
    })
    .strict(),
  z.object({ tool: z.literal('openSpreadsheet') }).strict(),
  z.object({ tool: z.literal('navigate'), url: z.string().max(2000) }).strict(),
  z.object({ tool: z.literal('search'), query: z.string().min(1).max(500) }).strict(),
  z.object({ tool: z.literal('readPage') }).strict(),
  z
    .object({
      tool: z.literal('openSearchResult'),
      index: z.number().int().min(1).max(5),
      pageId: z.string().uuid(),
    })
    .strict(),
  z.object({ tool: z.literal('goBack') }).strict(),
  z
    .object({ tool: z.literal('click'), controlId: z.string().max(100), pageId: z.string().uuid() })
    .strict(),
  z
    .object({
      tool: z.literal('fill'),
      controlId: z.string().max(100),
      pageId: z.string().uuid(),
      value: z.string().max(1000),
    })
    .strict(),
  z.object({ tool: z.literal('describeScreen') }).strict(),
  z.object({ tool: z.literal('confirmFill') }).strict(),
]);
export type ComputerAction = z.infer<typeof computerActionSchema>;
export const computerPlanSchema = z
  .object({
    action: computerActionSchema.nullable(),
    clarification: z.string().max(600).nullable(),
  })
  .strict()
  .refine(
    (p) => Boolean(p.action) !== Boolean(p.clarification),
    'Choose one action or a clarification.',
  );
export type ComputerPlan = z.infer<typeof computerPlanSchema>;
export type BrowserControl = {
  id: string;
  role: string;
  name: string;
  sensitive: boolean;
  blocked: boolean;
};
export type BrowserView = {
  id: string;
  url: string;
  title: string;
  text: string;
  controls: BrowserControl[];
  searchResults: { title: string; url: string; snippet: string }[];
  image: string;
  capturedAt: string;
};
export type CodeArtifact = {
  filename: string;
  code: string;
  provider: 'starter-template' | 'hugging-face';
  sha256: string;
  output: string;
  exitCode: number | null;
  status: 'created' | 'running' | 'completed' | 'failed' | 'cancelled';
  editorOpened: boolean;
};
export type ScreenView = {
  name: string;
  image: string;
  capturedAt: string;
  description: string | null;
};
export type ComputerState = {
  folder: { id: string; name: string } | null;
  code: CodeArtifact | null;
  browser: BrowserView | null;
  screen: ScreenView | null;
  presentation?: {
    filename: string;
    title: string;
    slideCount: number;
    slideTitles: string[];
    opened: boolean;
    sha256: string;
  } | null;
  spreadsheet?: {
    filename: string;
    sheet: string;
    rows: number;
    summary: string;
    sha256: string;
    opened: boolean;
  } | null;
};
export type ComputerResult = { summary: string; state: ComputerState; clarification?: boolean };
