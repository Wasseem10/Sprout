import { z } from 'zod';
import type { EnergyState } from './energy.js';
import type { FinanceState } from './finance.js';
import type { BillWorkspace } from './bills.js';
import type { StudioState } from './studio.js';
import type { PresentationProjectView } from './presentation-project.js';
import type { ResearchPresentationView } from './presentation-research.js';

export const nativeAppSchema = z.enum([
  'browser',
  'chrome',
  'edge',
  'fileExplorer',
  'notepad',
  'calculator',
  'vsCode',
  'excel',
  'powerPoint',
]);
export type NativeAppId = z.infer<typeof nativeAppSchema>;

/** Bind a native result to the exact structured artifact that requested it. */
export const presentationArtifactIdentitySchema = z.object({
  projectId: z.string().uuid(),
  revision: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type PresentationArtifactIdentity = z.infer<typeof presentationArtifactIdentitySchema>;

export const computerActionSchema = z.discriminatedUnion('tool', [
  z
    .object({ tool: z.literal('presentationHelp'), request: z.string().trim().min(1).max(2000) })
    .strict(),
  z.object({ tool: z.literal('studioHelp'), request: z.string().trim().min(1).max(2000) }).strict(),
  z
    .object({ tool: z.literal('financeHelp'), request: z.string().trim().min(1).max(2000) })
    .strict(),
  z.object({ tool: z.literal('energyHelp'), request: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ tool: z.literal('openApp'), app: nativeAppSchema }).strict(),
  z.object({ tool: z.literal('openFolder'), name: z.string().trim().min(1).max(500) }).strict(),
  z.object({ tool: z.literal('openSelectedFolder') }).strict(),
  z.object({ tool: z.literal('openImageSourceFolder') }).strict(),
  z
    .object({
      tool: z.literal('nextScreenStep'),
      goal: z.string().trim().min(3).max(1000),
      history: z.array(z.string().max(250)).max(6),
    })
    .strict(),
  z
    .object({
      tool: z.literal('pursueBrowserGoal'),
      kind: z.enum(['job', 'shopping']),
      query: z.string().trim().min(2).max(300),
    })
    .strict(),
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
      tool: z.literal('goToSlide'),
      slide: z.union([
        z.number().int().min(1).max(500),
        z.enum(['next', 'previous', 'first', 'last']),
      ]),
    })
    .strict(),
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
    .object({ tool: z.literal('searchCurrentSite'), query: z.string().trim().min(1).max(300) })
    .strict(),
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
  z
    .object({
      tool: z.literal('locateScreenTarget'),
      target: z.string().trim().min(2).max(120),
    })
    .strict(),
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
  studio?: StudioState | null;
  bills?: BillWorkspace | null;
  finance?: FinanceState | null;
  energy?: EnergyState | null;
  task?: {
    id: string;
    goal: string;
    status: 'running' | 'waiting' | 'completed' | 'paused' | 'failed';
    message: string;
    steps: { tool: string; summary: string }[];
  } | null;
  memory?: { provider: 'local' | 'neon'; count: number };
  lastApp?: { app: NativeAppId; name: string; mode: 'focused' | 'launched' } | null;
  folder: { id: string; name: string } | null;
  code: CodeArtifact | null;
  browser: BrowserView | null;
  screen: ScreenView | null;
  presentation?: {
    projectId?: string;
    filename: string;
    title: string;
    slideCount: number;
    slideTitles: string[];
    opened: boolean;
    sha256: string;
    selectedSlide?: number;
    desktopNavigation?: {
      status: 'verified' | 'failed';
      slide?: number;
      requestedSlide?: number | 'next' | 'previous' | 'first' | 'last';
      message?: string;
    };
    imageEdits?: { slide: number; filename: string; altText: string }[];
    project?: PresentationProjectView;
    research?: ResearchPresentationView;
  } | null;
  spreadsheet?: {
    filename: string;
    sheet: string;
    rows: number;
    summary: string;
    sha256: string;
    opened: boolean;
    provider?: 'local' | 'databricks';
    queryReference?: string;
  } | null;
};
export type ScreenPointer = {
  x: number;
  y: number;
  target: string;
  observedText: string;
  context: 'listing' | 'form' | 'checkout' | 'desktop' | 'other';
  authorization: { nonce: string; expiresAt: number; proof: string };
};
export type ComputerResult = {
  failure?: import('./presentation-failure.js').PresentationFailure;
  persistence?: { projectId: string; revision: number; sha256: string; provider: 'neon' | 'local'; savedAt: string; verified: boolean };
  taskStatus?: 'completed' | 'awaiting_input' | 'recoverable_failure' | 'failed';
  changes?: import('./presentation-change.js').PresentationChangeReceipt[];
  recovery?: import('./presentation-intent.js').PresentationRecoveryChoice;
  desktopIntent?:
    | { kind: 'describe' }
    | { kind: 'activateApp'; app: NativeAppId }
    | {
        kind: 'openFolder';
        name: string;
        path?: string;
        continueRequest?: string;
        imageSource?: boolean;
      }
    | {
        kind: 'slide';
        slide: number | 'next' | 'previous' | 'first' | 'last';
        filename?: string;
        identity?: PresentationArtifactIdentity;
        continueRequest?: string;
      };
  spokenSummary?: string;
  tool?: ComputerAction['tool'];
  summary: string;
  state: ComputerState;
  clarification?: boolean;
  pointer?: ScreenPointer;
  screenStep?: {
    decision: 'click' | 'scroll' | 'done' | 'ask';
    target?: string;
    direction?: 'up' | 'down';
  };
};
