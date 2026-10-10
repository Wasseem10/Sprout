import {
  planSchema,
  type Action,
  type Plan,
  type Progress,
  type ToolResult,
  type Workspace,
} from './schema.js';

export interface WorkflowModule {
  id: string;
  label: string;
  schemaVersion: number;
  supportedTools: readonly string[];
  execute(action: Action, state: Workspace, signal: AbortSignal): Promise<ToolResult>;
  serialize(state: Workspace): unknown;
  restore(value: unknown): Workspace;
  artifactSummary(state: Workspace): string;
}
export class WorkflowRegistry {
  private modules = new Map<string, WorkflowModule>();
  register(module: WorkflowModule) {
    if (this.modules.has(module.id)) throw new Error('Workflow already registered.');
    this.modules.set(module.id, module);
  }
  get(id: string) {
    const m = this.modules.get(id);
    if (!m) throw new Error('Unsupported workflow.');
    return m;
  }
}
export class TaskEngine {
  private controller: AbortController | null = null;
  private generation = 0;
  constructor(private registry: WorkflowRegistry) {}
  get busy() {
    return this.controller !== null;
  }
  stop() {
    this.generation++;
    this.controller?.abort();
    this.controller = null;
  }
  async run(
    request: string,
    initial: Workspace,
    planner: (request: string, state: Workspace, signal: AbortSignal) => Promise<Plan>,
    progress: (p: Progress) => void,
    commit: (state: Workspace, results: ToolResult[]) => void,
  ) {
    if (this.busy) throw new Error('A task is already running. Stop it before starting another.');
    const controller = new AbortController(),
      generation = ++this.generation;
    this.controller = controller;
    const checkpoint = () => {
      if (controller.signal.aborted || generation !== this.generation)
        throw new DOMException('Task stopped.', 'AbortError');
    };
    try {
      progress({ phase: 'thinking', detail: 'Understanding your request' });
      const plan = planSchema.parse(
        await planner(request, structuredClone(initial), controller.signal),
      );
      checkpoint();
      if (plan.clarification) {
        progress({ phase: 'ready', detail: plan.clarification });
        return { clarification: plan.clarification, results: [] };
      }
      let draft = structuredClone(initial);
      const results: ToolResult[] = [];
      const module = this.registry.get(initial.moduleId);
      for (const action of plan.actions) {
        checkpoint();
        if (!module.supportedTools.includes(action.tool))
          throw new Error('The requested tool is not available in this workflow.');
        progress({
          phase: 'working',
          detail: `${action.tool.replace(/([A-Z])/g, ' $1').toLowerCase()}`,
        });
        const result = await module.execute(action, draft, controller.signal);
        checkpoint();
        draft = result.state;
        results.push(result);
      }
      checkpoint();
      commit(draft, results);
      progress({ phase: 'ready', detail: 'Result verified' });
      return { clarification: null, results };
    } catch (error) {
      if (controller.signal.aborted || generation !== this.generation)
        throw new DOMException('Task stopped.', 'AbortError');
      progress({
        phase: 'error',
        detail: error instanceof Error ? error.message : 'Unable to complete the task.',
      });
      throw error;
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }
}
