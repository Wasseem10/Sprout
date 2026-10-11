import type { Workspace, AnalysisResult } from './schema.js';

export type StudioOutput = { filename: string; sha256: string; revision: number; opened: boolean };
export type StudioState = {
  workspace: Workspace;
  baseline: AnalysisResult;
  revision: number;
  sourceSheet: string;
  sourceRows?: number[];
  lastChange: string;
  evidence: string[];
  canUndo: boolean;
  interpretation: 'hugging-face' | 'supported-commands';
  outputs: { excel: StudioOutput | null; powerpoint: StudioOutput | null };
};

export function includedStudioRows(studio: StudioState) {
  const { dataset, result } = studio.workspace;
  if (!dataset || !result) return [];
  const c = result.comparison;
  return dataset.rows.map((row, i) => ({
    ...row,
    sourceRow: studio.sourceRows?.[i] ?? i + 2,
    included:
      ((row.date >= c.previous.start && row.date <= c.previous.end) ||
        (row.date >= c.current.start && row.date <= c.current.end)) &&
      (!c.commonLocations ||
        (row.operating_start <= c.previous.start &&
          (!row.operating_end || row.operating_end >= c.current.end))),
  }));
}

export const studioMoney = (v: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(v);
export const studioPercent = (v: number | null) => (v === null ? 'undefined' : `${v.toFixed(1)}%`);

export function studioSummary(studio: StudioState) {
  const r = studio.workspace.result!;
  return `${r.comparison.current.label} revenue is ${studioMoney(r.currentTotal)}, compared with ${studioMoney(r.previousTotal)} in ${r.comparison.previous.label}. Growth is ${studioPercent(r.percent)}. ${r.comparison.commonLocations ? `Only continuously operating locations are included; ${r.excludedLocations} locations are excluded.` : 'All reported locations are included.'}`;
}
