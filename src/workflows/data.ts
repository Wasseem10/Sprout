import {
  workspaceSchema,
  toolNames,
  type Workspace,
  type Action,
  type ToolResult,
  type Preferences,
  type TaskMetadata,
} from '../../shared/schema';
import { describeResult, money, percent } from '../../shared/presentation';
import type { WorkflowModule } from '../../shared/engine';
import { backend } from '../api';
import { inferComparison } from '../../shared/periods';
export class DataWorkflow implements WorkflowModule {
  id = 'data';
  label = 'Data workspace';
  schemaVersion = 1;
  supportedTools = toolNames;
  constructor(
    private getHistory: () => Workspace[],
    private getMetadata: () => { preferences: Preferences; lastTask: TaskMetadata },
  ) {}
  serialize(state: Workspace) {
    return workspaceSchema.parse(state);
  }
  restore(value: unknown) {
    return workspaceSchema.parse(value);
  }
  artifactSummary(state: Workspace) {
    return state.result
      ? describeResult(state.result, state.view.topN)
      : state.dataset
        ? `${state.dataset.name}: ${state.dataset.rows.length} rows.`
        : 'No file open.';
  }
  async execute(action: Action, initial: Workspace, signal: AbortSignal): Promise<ToolResult> {
    const state = structuredClone(initial);
    let summary = '',
      changed = false;
    const references = [];
    if (action.tool === 'describeChanges') {
      const previous = this.getHistory().at(-1);
      if (!previous)
        return {
          summary: 'There is no earlier workspace version to compare.',
          state,
          references: [],
          changed: false,
        };
      const changes: string[] = [];
      if (previous.dataset?.id !== state.dataset?.id)
        changes.push(`Opened ${state.dataset?.name ?? 'an empty workspace'}.`);
      if (previous.result?.currentTotal !== state.result?.currentTotal && state.result)
        changes.push(
          `Current-period revenue changed from ${previous.result ? money(previous.result.currentTotal) : 'not calculated'} to ${money(state.result.currentTotal)}.`,
        );
      if (
        previous.result?.comparison.commonLocations !== state.result?.comparison.commonLocations &&
        state.result
      )
        changes.push(
          state.result.comparison.commonLocations
            ? 'Now restricted to locations operating throughout both quarters.'
            : 'Now includes all reported locations.',
        );
      if (previous.view.kind !== state.view.kind)
        changes.push(`View changed from ${previous.view.kind} to ${state.view.kind}.`);
      if (previous.view.topN !== state.view.topN)
        changes.push(
          state.view.topN
            ? `The view now shows the top ${state.view.topN} regions.`
            : 'The view now shows all regions.',
        );
      return {
        summary:
          changes.join(' ') ||
          'The latest version recalculated the same view and totals. You can undo it.',
        state,
        references: [],
        changed: false,
      };
    }
    if (action.tool === 'undoChange') {
      const previous = this.getHistory().at(-1);
      if (!previous) throw new Error('There is no earlier workspace change to undo.');
      return {
        summary: 'Restored the previous workspace view, filters, and result.',
        state: { ...structuredClone(previous), projectId: state.projectId ?? previous.projectId },
        references: [],
        changed: false,
        historyOperation: 'undo',
      };
    }
    if (action.tool === 'resumeProject') {
      const id =
        action.args.projectId ?? state.projectId ?? localStorage.getItem('insightos.lastProject');
      if (!id) throw new Error('Save a workspace first, or choose one from Saved workspaces.');
      const saved = await backend.load(id, signal);
      signal.throwIfAborted();
      return {
        summary: `Restored ${saved.project.state.title} from ${saved.provider === 'neon' ? 'cloud storage' : 'local development storage'}.`,
        state: this.restore(saved.project.state),
        references: [],
        changed: false,
        historyOperation: 'restore',
        history: saved.project.history,
        preferences: saved.project.preferences,
        lastTask: saved.project.lastTask,
      };
    }
    if (action.tool === 'saveProject') {
      if (!state.dataset) throw new Error('Open a dataset before saving a workspace.');
      const saved = await backend.save(
        { state, history: this.getHistory(), ...this.getMetadata() },
        signal,
      );
      signal.throwIfAborted();
      state.projectId = saved.id;
      return {
        summary: `Saved ${state.title}. You can close the app and resume this workspace. Storage: ${saved.provider === 'neon' ? 'Neon' : 'local development storage'}.`,
        state,
        references: [{ label: 'Saved project', reference: saved.id }],
        changed: false,
      };
    }
    if (!state.dataset) throw new Error('Open a CSV or load the synthetic sample first.');
    if (action.tool === 'inspectDataset') {
      const dates = state.dataset.rows.map((r) => r.date).sort(),
        locations = new Set(state.dataset.rows.map((r) => r.location_id)),
        regions = new Set(state.dataset.rows.map((r) => r.region));
      summary = `${state.dataset.name} contains ${state.dataset.rows.length} rows across ${locations.size} locations and ${regions.size} regions, from ${dates[0]} to ${dates.at(-1)}. Columns: date, location ID, region, revenue in USD, operating start, and operating end. ${state.dataset.synthetic ? 'This is clearly labeled synthetic demonstration data.' : 'This is your imported file.'}`;
    } else if (action.tool === 'compareRevenue' || action.tool === 'refineComparison') {
      const comparison =
        action.args.comparison ?? state.result?.comparison ?? inferComparison(state.dataset);
      const next = {
        ...comparison,
        commonLocations: action.args.commonLocations ?? comparison.commonLocations,
      };
      const { result } = await backend.analyze(state.dataset, next, signal);
      signal.throwIfAborted();
      state.result = result;
      state.view.topN = null;
      changed = true;
      summary = describeResult(result);
      references.push({ label: 'Analysis source', reference: result.queryReference });
    } else {
      if (!state.result)
        throw new Error('Compare revenue first so the workspace has a calculated result.');
      if (action.tool === 'createChart') {
        state.view.kind = 'chart';
        changed = true;
        summary =
          'Created a revenue comparison chart. ' + describeResult(state.result, state.view.topN);
      }
      if (action.tool === 'updateChart') {
        state.view.kind = 'chart';
        state.view.topN = action.args.topN ?? null;
        changed = true;
        summary = 'Updated the chart. ' + describeResult(state.result, state.view.topN);
      }
      if (action.tool === 'describeChart') summary = describeResult(state.result, state.view.topN);
      if (action.tool === 'explainCalculation') {
        state.view.kind = 'calculation';
        changed = true;
        const r = state.result;
        summary = `${r.calculation} Here: (${money(r.currentTotal)} − ${money(r.previousTotal)}) ÷ ${money(Math.abs(r.previousTotal))} × 100 = ${percent(r.percent)}. ${r.includedRows} rows from ${r.includedLocations} locations are included; ${r.excludedLocations} locations are excluded. Periods: ${r.comparison.previous.start} through ${r.comparison.previous.end}, and ${r.comparison.current.start} through ${r.comparison.current.end}. Source: ${r.provider === 'databricks' ? 'Databricks' : 'local sample calculation'}.`;
      }
      references.push({ label: 'Analysis source', reference: state.result.queryReference });
    }
    return { summary, state, references, changed };
  }
}
