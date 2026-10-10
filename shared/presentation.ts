import type { AnalysisResult, Workspace } from './schema.js';
export const money = (v: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(v);
export const percent = (v: number | null) =>
  v === null ? 'Not defined' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
export function visibleRegions(state: Workspace) {
  return state.result?.regions.slice(0, state.view.topN ?? undefined) ?? [];
}
export function describeResult(result: AnalysisResult, topN: number | null = null) {
  const r = result.regions.slice(0, topN ?? undefined),
    leader = r[0];
  return `${result.comparison.current.label} revenue is ${money(result.currentTotal)}, compared with ${money(result.previousTotal)} in ${result.comparison.previous.label}: ${percent(result.percent)}. ${leader ? `${leader.region} has the largest absolute revenue change, ${money(leader.delta)} (${percent(leader.percent)}).` : 'No locations match this filter.'} ${result.comparison.commonLocations ? 'Only locations operating throughout both quarters are included.' : 'All reported locations are included.'} ${topN ? `The view shows the top ${Math.min(topN, r.length)} regions by absolute revenue change; totals still cover all included regions.` : ''}`.trim();
}
