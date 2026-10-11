import { z } from 'zod';

/** Bounded authoritative graph content; independent of voice routing and native desktop actions. */
export const FLOWCHART_NODE_LIMIT = 7;
const identity = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const label = z.string().trim().min(1).max(60);
const branchLabel = z.string().trim().min(1).max(32);
const kind = z.enum(['start', 'process', 'decision', 'end']);
export const flowNodeSchema = z.strictObject({ id: identity, kind, label });
export const flowEdgeSchema = z.strictObject({
  id: identity,
  from: identity,
  to: identity,
  branchLabel: branchLabel.optional(),
});
export type FlowNode = z.infer<typeof flowNodeSchema>;
export type FlowEdge = z.infer<typeof flowEdgeSchema>;
type GraphShape = { orientation: 'vertical'; nodes: FlowNode[]; edges: FlowEdge[] };
const normalized = (value: string) =>
  value.normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g, ' ').trim();

function graphIssues(graph: GraphShape): { path: (string | number)[]; message: string }[] {
  const issues: { path: (string | number)[]; message: string }[] = [];
  // The base schema reports size failures; do not traverse unbounded rejected input.
  if (graph.nodes.length > FLOWCHART_NODE_LIMIT || graph.edges.length > FLOWCHART_NODE_LIMIT)
    return issues;
  const problem = (message: string, path: (string | number)[] = []) =>
    issues.push({ path, message });
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const edgeIds = new Set(graph.edges.map((edge) => edge.id));
  if (nodeIds.size !== graph.nodes.length)
    problem('Every node needs a unique permanent ID.', ['nodes']);
  if (edgeIds.size !== graph.edges.length || graph.edges.some((edge) => nodeIds.has(edge.id)))
    problem('Every edge needs a unique ID distinct from node IDs.', ['edges']);
  const pairs = new Set<string>();
  for (const [index, edge] of graph.edges.entries()) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to))
      problem('Every connection must join two existing nodes.', ['edges', index]);
    if (edge.from === edge.to) problem('A node cannot connect to itself.', ['edges', index]);
    const pair = `${edge.from}\0${edge.to}`;
    if (pairs.has(pair))
      problem('Use only one connection between the same two nodes.', ['edges', index]);
    pairs.add(pair);
  }
  if (issues.length) return issues;
  const incoming = new Map(
    graph.nodes.map((node) => [node.id, graph.edges.filter((edge) => edge.to === node.id)]),
  );
  const outgoing = new Map(
    graph.nodes.map((node) => [node.id, graph.edges.filter((edge) => edge.from === node.id)]),
  );
  const starts = graph.nodes.filter((node) => node.kind === 'start');
  const decisions = graph.nodes.filter((node) => node.kind === 'decision');
  const ends = graph.nodes.filter((node) => node.kind === 'end');
  if (starts.length !== 1) problem('Use exactly one start node.', ['nodes']);
  if (decisions.length !== 1)
    problem('Use exactly one decision with two labeled branches.', ['nodes']);
  if (!ends.length) problem('Every diagram needs at least one end node.', ['nodes']);
  const merges = graph.nodes.filter((node) => incoming.get(node.id)!.length === 2);
  if (merges.length > 1) problem('The two branches can join at most once.', ['edges']);
  for (const [index, node] of graph.nodes.entries()) {
    const inEdges = incoming.get(node.id)!,
      outEdges = outgoing.get(node.id)!;
    if (node.kind === 'start' && inEdges.length)
      problem('The start cannot have an incoming connection.', ['nodes', index]);
    if (node.kind !== 'start' && (inEdges.length < 1 || inEdges.length > 2))
      problem(
        'Each non-start node needs one incoming connection, or two at the single shared merge.',
        ['nodes', index],
      );
    if (
      node.kind === 'end'
        ? outEdges.length !== 0
        : node.kind !== 'decision' && outEdges.length !== 1
    )
      problem(
        node.kind === 'end'
          ? 'End nodes cannot have outgoing connections.'
          : 'Each non-decision step must continue along exactly one connection.',
        ['nodes', index],
      );
    if (node.kind === 'decision') {
      if (outEdges.length !== 2 || outEdges.some((edge) => !edge.branchLabel))
        problem('The decision needs exactly two labeled outgoing branches.', ['nodes', index]);
      else if (new Set(outEdges.map((edge) => normalized(edge.branchLabel!))).size !== 2)
        problem('Give the two decision branches different labels.', ['nodes', index]);
    } else if (outEdges.some((edge) => edge.branchLabel !== undefined))
      problem('Only connections leaving the decision can have branch labels.', ['nodes', index]);
  }
  const visited = new Set<string>(),
    visiting = new Set<string>();
  let cycle = false;
  const visit = (id: string) => {
    if (visiting.has(id)) {
      cycle = true;
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const edge of outgoing.get(id)!) visit(edge.to);
    visiting.delete(id);
    visited.add(id);
  };
  for (const node of graph.nodes) visit(node.id);
  if (cycle)
    problem('This version supports forward paths only. Remove the loop or use a separate end.', [
      'edges',
    ]);
  const reachable = (initial: string[], reverse = false) => {
    const seen = new Set(initial),
      queue = [...initial];
    for (let index = 0; index < queue.length; index++) {
      for (const edge of (reverse ? incoming : outgoing).get(queue[index])!) {
        const id = reverse ? edge.from : edge.to;
        if (!seen.has(id)) {
          seen.add(id);
          queue.push(id);
        }
      }
    }
    return seen;
  };
  if (starts.length === 1 && reachable([starts[0].id]).size !== graph.nodes.length)
    problem('Connect every node to the path from the start.', ['nodes']);
  if (
    reachable(
      ends.map((node) => node.id),
      true,
    ).size !== graph.nodes.length
  )
    problem('Every node must have a path to an end.', ['nodes']);
  if (!issues.length && merges.length && decisions.length === 1) {
    const merge = merges[0].id;
    const branches = outgoing.get(decisions[0].id)!;
    if (branches.some((edge) => edge.to === merge))
      problem('Each branch needs its own step or end before a shared merge.', ['edges']);
  }
  return issues;
}

export const flowchartSchema = z
  .strictObject({
    orientation: z.literal('vertical'),
    nodes: z.array(flowNodeSchema).min(4).max(FLOWCHART_NODE_LIMIT),
    edges: z.array(flowEdgeSchema).min(3).max(FLOWCHART_NODE_LIMIT),
  })
  .superRefine((graph, ctx) => {
    for (const issue of graphIssues(graph)) ctx.addIssue({ code: 'custom', ...issue });
  });
export type Flowchart = z.infer<typeof flowchartSchema>;

/** The model can propose temporary relationships, never permanent object IDs. */
export const flowchartProposalSchema = z
  .strictObject({
    orientation: z.literal('vertical'),
    nodes: z
      .array(z.strictObject({ ref: identity, kind, label }))
      .min(4)
      .max(FLOWCHART_NODE_LIMIT),
    edges: z
      .array(z.strictObject({ from: identity, to: identity, branchLabel: branchLabel.optional() }))
      .min(3)
      .max(FLOWCHART_NODE_LIMIT),
  })
  .superRefine((proposal, ctx) => {
    const temporary: GraphShape = {
      orientation: proposal.orientation,
      nodes: proposal.nodes.map((node) => ({
        id: `node_${node.ref}`,
        kind: node.kind,
        label: node.label,
      })),
      edges: proposal.edges.map((edge, index) => ({
        ...edge,
        id: `edge_${index}`,
        from: `node_${edge.from}`,
        to: `node_${edge.to}`,
      })),
    };
    for (const issue of graphIssues(temporary)) ctx.addIssue({ code: 'custom', ...issue });
  });
export type FlowchartProposal = z.infer<typeof flowchartProposalSchema>;
export type FlowchartIdFactory = (kind: 'node' | 'edge', temporaryReference: string) => string;
const allocateId: FlowchartIdFactory = (kind) => `flow_${kind}_${crypto.randomUUID()}`;

export class FlowchartError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid_graph' | 'ambiguous_target' | 'no_meaningful_change' = 'invalid_graph',
  ) {
    super(message);
    this.name = 'FlowchartError';
  }
}
export function validateFlowchart(input: unknown): Flowchart {
  const result = flowchartSchema.safeParse(input);
  if (!result.success) {
    const size = result.error.issues.some(
      (issue) => issue.code === 'too_big' && issue.path[0] === 'nodes',
    );
    const topology = result.error.issues.find((issue) => issue.code === 'custom');
    throw new FlowchartError(
      size
        ? 'This diagram supports up to seven nodes. Remove a process step before adding another.'
        : (topology?.message ??
            'The diagram needs valid node labels, connection IDs and a vertical layout.'),
    );
  }
  return result.data;
}
export function materializeFlowchart(
  input: unknown,
  idFactory: FlowchartIdFactory = allocateId,
): Flowchart {
  const parsed = flowchartProposalSchema.safeParse(input);
  if (!parsed.success)
    throw new FlowchartError(
      parsed.error.issues.find((issue) => issue.code === 'custom')?.message ??
        'The diagram proposal must use temporary references, up to seven nodes and bounded labels.',
    );
  const proposal = parsed.data;
  const ids = new Map(proposal.nodes.map((node) => [node.ref, idFactory('node', node.ref)]));
  return validateFlowchart({
    orientation: 'vertical',
    nodes: proposal.nodes.map((node) => ({
      id: ids.get(node.ref),
      kind: node.kind,
      label: node.label,
    })),
    edges: proposal.edges.map((edge, index) => ({
      ...edge,
      id: idFactory('edge', `${edge.from}:${edge.to}:${index}`),
      from: ids.get(edge.from),
      to: ids.get(edge.to),
    })),
  });
}

export const flowchartPatchSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('renameNode'), nodeId: identity, label }),
  z.strictObject({ type: z.literal('insertProcessOnEdge'), edgeId: identity, label }),
  z.strictObject({ type: z.literal('removeProcessReconnect'), nodeId: identity }),
  z.strictObject({ type: z.literal('relabelBranch'), edgeId: identity, label: branchLabel }),
]);
export type FlowchartPatch = z.infer<typeof flowchartPatchSchema>;

/** Pure patching. A caller owns revision identity, cancellation, history and commit. */
export function applyFlowchartPatch(
  input: Flowchart,
  inputPatch: FlowchartPatch,
  idFactory: FlowchartIdFactory = allocateId,
): Flowchart {
  const graph = validateFlowchart(input);
  const parsed = flowchartPatchSchema.safeParse(inputPatch);
  if (!parsed.success)
    throw new FlowchartError(
      'Use a supported node or branch change with a valid label and current ID.',
    );
  const patch = parsed.data;
  if (patch.type === 'renameNode') {
    const node = graph.nodes.find((node) => node.id === patch.nodeId);
    if (!node)
      throw new FlowchartError(
        'That node is no longer in the diagram. Choose a current node.',
        'ambiguous_target',
      );
    if (node.label === patch.label)
      throw new FlowchartError(
        'That node already has this label. The diagram is unchanged.',
        'no_meaningful_change',
      );
    node.label = patch.label;
  } else if (patch.type === 'relabelBranch') {
    const edge = graph.edges.find((edge) => edge.id === patch.edgeId);
    if (!edge || graph.nodes.find((node) => node.id === edge.from)?.kind !== 'decision')
      throw new FlowchartError(
        'Choose one of the two branches leaving the decision.',
        'ambiguous_target',
      );
    if (edge.branchLabel === patch.label)
      throw new FlowchartError(
        'That branch already has this label. The diagram is unchanged.',
        'no_meaningful_change',
      );
    edge.branchLabel = patch.label;
  } else if (patch.type === 'insertProcessOnEdge') {
    if (graph.nodes.length === FLOWCHART_NODE_LIMIT)
      throw new FlowchartError(
        'This diagram already has seven nodes. Remove a process step before adding another.',
      );
    const index = graph.edges.findIndex((edge) => edge.id === patch.edgeId);
    if (index < 0)
      throw new FlowchartError(
        'That connection is no longer in the diagram. Choose a current connection.',
        'ambiguous_target',
      );
    const old = graph.edges[index];
    const nodeId = idFactory('node', old.id);
    const edgeId = idFactory('edge', old.id);
    graph.nodes.splice(
      graph.nodes.findIndex((node) => node.id === old.to),
      0,
      { id: nodeId, kind: 'process', label: patch.label },
    );
    graph.edges.splice(index, 1, { ...old, to: nodeId }, { id: edgeId, from: nodeId, to: old.to });
  } else {
    const node = graph.nodes.find((node) => node.id === patch.nodeId);
    if (!node)
      throw new FlowchartError(
        'That node is no longer in the diagram. Choose a current node.',
        'ambiguous_target',
      );
    if (node.kind !== 'process')
      throw new FlowchartError(
        'Only a process step can be removed. Keep the start, decision and end nodes.',
      );
    const incoming = graph.edges.filter((edge) => edge.to === node.id),
      outgoing = graph.edges.filter((edge) => edge.from === node.id);
    if (incoming.length !== 1 || outgoing.length !== 1)
      throw new FlowchartError(
        'A shared merge cannot be removed by reconnecting a single process step.',
      );
    graph.nodes = graph.nodes.filter((candidate) => candidate.id !== node.id);
    graph.edges = graph.edges
      .filter((edge) => edge.id !== outgoing[0].id)
      .map((edge) => (edge.id === incoming[0].id ? { ...edge, to: outgoing[0].to } : edge));
  }
  return validateFlowchart(graph);
}

export type FlowchartBranchPath = {
  edgeId: string;
  label: string;
  nodeIds: string[];
  edgeIds: string[];
  exclusiveNodeIds: string[];
};
export type FlowchartPaths = {
  startId: string;
  decisionId: string;
  commonNodeIds: string[];
  branches: [FlowchartBranchPath, FlowchartBranchPath];
  mergeNodeId?: string;
  sharedNodeIds: string[];
};
/** Branches follow stored edges all the way to an end, including shared continuation. */
export function flowchartPaths(input: Flowchart): FlowchartPaths {
  const graph = validateFlowchart(input);
  const start = graph.nodes.find((node) => node.kind === 'start')!,
    decision = graph.nodes.find((node) => node.kind === 'decision')!;
  const walk = (initial: string, until?: string) => {
    const nodes = [initial],
      edges: string[] = [];
    let at = initial;
    while (at !== until) {
      const edge = graph.edges.find((edge) => edge.from === at);
      if (!edge) break;
      edges.push(edge.id);
      nodes.push(edge.to);
      at = edge.to;
    }
    return { nodes, edges };
  };
  const merge = graph.nodes.find(
    (node) => graph.edges.filter((edge) => edge.to === node.id).length === 2,
  );
  const branches = graph.edges
    .filter((edge) => edge.from === decision.id)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((edge) => {
      const path = walk(edge.to);
      const mergeIndex = merge ? path.nodes.indexOf(merge.id) : -1;
      return {
        edgeId: edge.id,
        label: edge.branchLabel!,
        nodeIds: path.nodes,
        edgeIds: [edge.id, ...path.edges],
        exclusiveNodeIds: mergeIndex < 0 ? [...path.nodes] : path.nodes.slice(0, mergeIndex),
      };
    }) as [FlowchartBranchPath, FlowchartBranchPath];
  return {
    startId: start.id,
    decisionId: decision.id,
    commonNodeIds: walk(start.id, decision.id).nodes,
    branches,
    ...(merge ? { mergeNodeId: merge.id } : {}),
    sharedNodeIds: merge ? walk(merge.id).nodes : [],
  };
}

/** One logical order for keyboard exploration and grounded ordinal read references. */
export function flowchartNodeOrder(input: Flowchart): string[] {
  const paths = flowchartPaths(input);
  return [...paths.commonNodeIds, ...paths.branches.flatMap(branch => branch.exclusiveNodeIds), ...paths.sharedNodeIds];
}

/** Exact normalized labels or existing IDs only; duplicate labels require a question. */
export function resolveFlowNode(input: Flowchart, reference: string): string {
  const graph = validateFlowchart(input);
  const exactId = graph.nodes.find((node) => node.id === reference);
  if (exactId) return exactId.id;
  const matches = graph.nodes.filter((node) => normalized(node.label) === normalized(reference));
  if (matches.length !== 1)
    throw new FlowchartError(
      matches.length
        ? 'More than one node has that label. Which branch or node do you mean?'
        : 'I could not match that node. Use its full label.',
      'ambiguous_target',
    );
  return matches[0].id;
}
export function resolveFlowBranch(input: Flowchart, reference: string): string {
  const branches = flowchartPaths(input).branches;
  const exactId = branches.find((branch) => branch.edgeId === reference);
  if (exactId) return exactId.edgeId;
  const matches = branches.filter((branch) => normalized(branch.label) === normalized(reference));
  if (matches.length !== 1)
    throw new FlowchartError('Choose one of the decision’s two branch labels.', 'ambiguous_target');
  return matches[0].edgeId;
}
export type FlowchartNarrationTarget =
  | { kind: 'all' | 'decision' }
  | { kind: 'node'; nodeId: string }
  | { kind: 'branch'; edgeId: string };
export function narrateFlowchart(
  input: Flowchart,
  target: FlowchartNarrationTarget = { kind: 'all' },
): string {
  const graph = validateFlowchart(input),
    paths = flowchartPaths(graph);
  const names = (ids: string[]) =>
    ids.map((id) => graph.nodes.find((node) => node.id === id)!.label);
  const branch = (value: FlowchartBranchPath) =>
    `If ${value.label}, follow ${names(value.nodeIds).join(', then ')}. That path ends at ${names(value.nodeIds.slice(-1))[0]}.`;
  const decision = () =>
    `Decision: ${names([paths.decisionId])[0]}. ${paths.branches.map(branch).join(' ')}${paths.mergeNodeId ? ` Both branches join at ${names([paths.mergeNodeId])[0]}.` : ''}`;
  if (target.kind === 'branch') {
    const selected = paths.branches.find((value) => value.edgeId === target.edgeId);
    if (!selected)
      throw new FlowchartError('That branch is no longer in the diagram.', 'ambiguous_target');
    return branch(selected);
  }
  if (target.kind === 'decision') return decision();
  if (target.kind === 'node') {
    const node = graph.nodes.find((node) => node.id === target.nodeId);
    if (!node)
      throw new FlowchartError('That node is no longer in the diagram.', 'ambiguous_target');
    if (node.kind === 'decision') return decision();
    if (node.kind === 'end') return `${node.label} is an end. There are no further steps.`;
    const commonIndex = paths.commonNodeIds.indexOf(node.id);
    if (commonIndex >= 0)
      return `From ${names(paths.commonNodeIds.slice(commonIndex)).join(', then ')}, reach the decision. ${decision()}`;
    const path = paths.branches.find((branch) => branch.nodeIds.includes(node.id))!;
    const remaining = path.nodeIds.slice(path.nodeIds.indexOf(node.id));
    return `From ${names(remaining).join(', then ')}. That path ends at ${names(remaining.slice(-1))[0]}.`;
  }
  return `Start at ${names(paths.commonNodeIds).join(', then ')}. ${decision()}`;
}
