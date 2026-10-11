import type {
  Comparison,
  Dataset,
  Plan,
  Project,
  Workspace,
  AnalysisResult,
} from '../shared/schema';
export type Status = {
  mode: 'sample' | 'live';
  hosted: boolean;
  sessionRequired: boolean;
  authenticated: boolean;
  computer: {
    local: boolean;
    pythonConfigured: boolean;
    editorConfigured: boolean;
    visionModel: string;
  };
  storage: string;
  integrations: {
    huggingFace: { configured: boolean; model: string };
    databricks: { configured: boolean };
    elevenLabs: { configured: boolean; ttsConfigured: boolean };
    neon: { configured: boolean };
    vultr: { configured: boolean };
  };
};
export type SavedProject = { id: string; title: string; updatedAt: string };
export async function api<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api' + url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
    credentials: 'same-origin',
  });
  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(
      'Sprout’s local service returned an incomplete response. It may be restarting. Please try again in a moment.',
    );
  }
  if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status}).`);
  return result as T;
}
export const backend = {
  status: () => api<Status>('/status'),
  session: (passphrase?: string) => api('/session', { passphrase }),
  sample: (signal?: AbortSignal) =>
    api<{ dataset: Dataset; comparison: Comparison }>('/sample', undefined, signal),
  import: (name: string, text: string, signal?: AbortSignal) =>
    api<{ dataset: Dataset; comparison: Comparison }>('/import', { name, text }, signal),
  plan: (request: string, state: Workspace, signal: AbortSignal) =>
    api<{ plan: Plan; provider: string }>('/plan', { request, state }, signal),
  analyze: (dataset: Dataset, comparison: Comparison, signal: AbortSignal) =>
    api<{ result: AnalysisResult }>('/analyze', { dataset, comparison }, signal),
  save: (project: Project, signal: AbortSignal) =>
    api<{ id: string; provider: string }>('/projects', project, signal),
  load: (id: string, signal: AbortSignal) =>
    api<{ project: Project; provider: string }>('/projects/' + id, undefined, signal),
  list: () => api<{ projects: SavedProject[]; provider: string }>('/projects'),
};
