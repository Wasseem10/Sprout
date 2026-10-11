import { describe, expect, it } from 'vitest';
import {
  applyFlowchartPatch,
  flowchartPatchSchema,
  flowchartPaths,
  flowchartProposalSchema,
  flowchartSchema,
  materializeFlowchart,
  narrateFlowchart,
  resolveFlowBranch,
  resolveFlowNode,
  validateFlowchart,
  type Flowchart,
  type FlowchartPatch,
  type FlowchartProposal,
} from '../shared/presentation-flowchart';

function sixNodeProposal(): FlowchartProposal {
  return {
    orientation: 'vertical',
    nodes: [
      { ref: 'start', kind: 'start', label: 'Start' },
      { ref: 'approval', kind: 'decision', label: 'Campaign approval' },
      { ref: 'launch', kind: 'process', label: 'Launch' },
      { ref: 'launched', kind: 'end', label: 'Campaign launched' },
      { ref: 'revise', kind: 'process', label: 'Revise' },
      { ref: 'revision', kind: 'end', label: 'Revision required' },
    ],
    edges: [
      { from: 'start', to: 'approval' },
      { from: 'approval', to: 'launch', branchLabel: 'Approved' },
      { from: 'launch', to: 'launched' },
      { from: 'approval', to: 'revise', branchLabel: 'Rejected' },
      { from: 'revise', to: 'revision' },
    ],
  };
}
function sixNodeGraph(): Flowchart {
  let edge = 0;
  return materializeFlowchart(sixNodeProposal(), (kind, ref) =>
    kind === 'node' ? `node_${ref}` : `edge_${edge++}`,
  );
}
function mergedGraph(): Flowchart {
  const graph = sixNodeGraph();
  graph.nodes = graph.nodes.filter((node) => !['node_launched', 'node_revision'].includes(node.id));
  graph.nodes.push(
    { id: 'node_merge', kind: 'process', label: 'Record outcome' },
    { id: 'node_end', kind: 'end', label: 'Finish' },
  );
  graph.edges = graph.edges.map((edge) =>
    ['edge_2', 'edge_4'].includes(edge.id) ? { ...edge, to: 'node_merge' } : edge,
  );
  graph.edges.push({ id: 'edge_5', from: 'node_merge', to: 'node_end' });
  return validateFlowchart(graph);
}
function variant(mutate: (graph: Flowchart) => void): Flowchart {
  const graph = sixNodeGraph();
  mutate(graph);
  return graph;
}

describe('bounded branching flowchart schema', () => {
  it('accepts distinct terminals and a single shared continuation with complete paths', () => {
    const separate = sixNodeGraph();
    expect(flowchartSchema.parse(separate)).toEqual(separate);
    const merged = mergedGraph();
    const paths = flowchartPaths(merged);
    expect(paths.commonNodeIds).toEqual(['node_start', 'node_approval']);
    expect(paths.mergeNodeId).toBe('node_merge');
    expect(paths.sharedNodeIds).toEqual(['node_merge', 'node_end']);
    expect(paths.branches.map((branch) => branch.exclusiveNodeIds)).toEqual([
      ['node_launch'],
      ['node_revise'],
    ]);
    expect(paths.branches.map((branch) => branch.nodeIds)).toEqual([
      ['node_launch', 'node_merge', 'node_end'],
      ['node_revise', 'node_merge', 'node_end'],
    ]);
  });

  it('allows an optional shared beginning and terminal-only exclusive branches', () => {
    const graph = sixNodeGraph();
    graph.nodes = graph.nodes.filter((node) => !['node_launch', 'node_revise'].includes(node.id));
    graph.edges = graph.edges
      .filter((edge) => !['edge_2', 'edge_4'].includes(edge.id))
      .map((edge) => ({
        ...edge,
        to:
          edge.to === 'node_launch'
            ? 'node_launched'
            : edge.to === 'node_revise'
              ? 'node_revision'
              : edge.to,
      }));
    const beginning = applyFlowchartPatch(
      graph,
      { type: 'insertProcessOnEdge', edgeId: 'edge_0', label: 'Prepare campaign' },
      (kind) => `prep_${kind}`,
    );
    expect(flowchartPaths(beginning).commonNodeIds).toEqual([
      'node_start',
      'prep_node',
      'node_approval',
    ]);
    expect(flowchartPaths(beginning).branches.map((branch) => branch.exclusiveNodeIds)).toEqual([
      ['node_launched'],
      ['node_revision'],
    ]);
  });

  it.each<[string, (graph: Flowchart) => void]>([
    [
      'duplicate node IDs',
      (graph) => {
        graph.nodes[2].id = graph.nodes[1].id;
      },
    ],
    [
      'duplicate edge IDs',
      (graph) => {
        graph.edges[2].id = graph.edges[1].id;
      },
    ],
    [
      'IDs shared by a node and edge',
      (graph) => {
        graph.edges[0].id = graph.nodes[0].id;
      },
    ],
    [
      'missing endpoint',
      (graph) => {
        graph.edges[0].to = 'absent';
      },
    ],
    [
      'self link',
      (graph) => {
        graph.edges[0].to = graph.edges[0].from;
      },
    ],
    [
      'duplicate edge endpoints',
      (graph) => {
        graph.edges.push({ ...graph.edges[0], id: 'duplicate' });
      },
    ],
    [
      'second start',
      (graph) => {
        graph.nodes[2].kind = 'start';
      },
    ],
    [
      'missing start',
      (graph) => {
        graph.nodes[0].kind = 'process';
      },
    ],
    [
      'second decision',
      (graph) => {
        graph.nodes[2].kind = 'decision';
      },
    ],
    [
      'missing decision',
      (graph) => {
        graph.nodes[1].kind = 'process';
      },
    ],
    [
      'missing ends',
      (graph) => {
        graph.nodes
          .filter((node) => node.kind === 'end')
          .forEach((node) => {
            node.kind = 'process';
          });
      },
    ],
    [
      'unlabeled decision branch',
      (graph) => {
        delete graph.edges[1].branchLabel;
      },
    ],
    [
      'equivalent branch labels',
      (graph) => {
        graph.edges[3].branchLabel = ' APPROVED ';
      },
    ],
    [
      'branch label on ordinary edge',
      (graph) => {
        graph.edges[0].branchLabel = 'Continue';
      },
    ],
    [
      'three decision branches',
      (graph) => {
        graph.edges.push({
          id: 'extra',
          from: 'node_approval',
          to: 'node_launched',
          branchLabel: 'Maybe',
        });
      },
    ],
    [
      'nondecision fork',
      (graph) => {
        graph.edges.push({ id: 'extra', from: 'node_launch', to: 'node_revision' });
      },
    ],
    [
      'incoming start edge',
      (graph) => {
        graph.edges.push({ id: 'extra', from: 'node_revision', to: 'node_start' });
      },
    ],
    [
      'outgoing end edge',
      (graph) => {
        graph.edges.push({ id: 'extra', from: 'node_revision', to: 'node_launched' });
      },
    ],
    [
      'dangling process',
      (graph) => {
        graph.edges = graph.edges.filter((edge) => edge.id !== 'edge_2');
      },
    ],
    [
      'disconnected node',
      (graph) => {
        graph.nodes.push({ id: 'orphan', kind: 'end', label: 'Orphan' });
      },
    ],
    [
      'cycle returning to approval',
      (graph) => {
        graph.edges[4].to = 'node_approval';
      },
    ],
    [
      'eighth total node',
      (graph) => {
        graph.nodes.push(
          { id: 'extra1', kind: 'process', label: 'Extra one' },
          { id: 'extra2', kind: 'process', label: 'Extra two' },
        );
      },
    ],
  ])('rejects %s', (_name, mutate) => {
    expect(flowchartSchema.safeParse(variant(mutate)).success).toBe(false);
  });

  it('rejects a branch that joins the merge without its own exclusive node', () => {
    const graph = mergedGraph();
    graph.nodes = graph.nodes.filter((node) => node.id !== 'node_launch');
    graph.edges = graph.edges
      .filter((edge) => edge.id !== 'edge_2')
      .map((edge) => (edge.id === 'edge_1' ? { ...edge, to: 'node_merge' } : edge));
    expect(() => validateFlowchart(graph)).toThrow('Each branch needs its own');
  });

  it('rejects two merges and any more than two incoming connections', () => {
    const graph = mergedGraph();
    graph.edges.push({ id: 'extra', from: 'node_revise', to: 'node_end' });
    expect(flowchartSchema.safeParse(graph).success).toBe(false);
    graph.edges[graph.edges.length - 1].to = 'node_merge';
    expect(flowchartSchema.safeParse(graph).success).toBe(false);
  });

  it('rejects unknown fields, unsupported orientation and excessive label lengths at every boundary', () => {
    const graph = sixNodeGraph();
    expect(flowchartSchema.safeParse({ ...graph, script: 'execute' }).success).toBe(false);
    expect(flowchartSchema.safeParse({ ...graph, orientation: 'horizontal' }).success).toBe(false);
    graph.nodes[0] = { ...graph.nodes[0], x: 1 } as (typeof graph.nodes)[0];
    expect(flowchartSchema.safeParse(graph).success).toBe(false);
    expect(
      flowchartSchema.safeParse(
        variant((graph) => {
          graph.nodes[0].label = 'x'.repeat(61);
        }),
      ).success,
    ).toBe(false);
    expect(
      flowchartSchema.safeParse(
        variant((graph) => {
          graph.edges[1].branchLabel = 'x'.repeat(33);
        }),
      ).success,
    ).toBe(false);
    expect(
      flowchartPatchSchema.safeParse({
        type: 'renameNode',
        nodeId: 'node_start',
        label: 'Start',
        kind: 'decision',
      }).success,
    ).toBe(false);
  });
});

describe('application-owned flowchart identity', () => {
  it('rejects permanent IDs in proposals and validates temporary relationships before allocation', () => {
    const proposal = sixNodeProposal();
    expect(
      flowchartProposalSchema.safeParse({
        ...proposal,
        nodes: proposal.nodes.map((node) => ({ ...node, id: 'model-id' })),
      }).success,
    ).toBe(false);
    const invalid = structuredClone(proposal);
    invalid.edges[0].to = 'missing';
    let calls = 0;
    expect(() =>
      materializeFlowchart(invalid, () => {
        calls++;
        return 'id';
      }),
    ).toThrow();
    expect(calls).toBe(0);
    invalid.edges[0].to = 'approval';
    invalid.nodes[2].ref = 'approval';
    expect(flowchartProposalSchema.safeParse(invalid).success).toBe(false);
  });

  it('uses only allocated IDs, validates allocator collisions and keeps all temporary labels as plain text', () => {
    const proposal = sixNodeProposal();
    proposal.nodes[0].label = '<b>Start</b>';
    const graph = materializeFlowchart(proposal);
    expect(graph.nodes.every((node) => /^flow_node_[a-f0-9-]+$/.test(node.id))).toBe(true);
    expect(graph.edges.every((edge) => /^flow_edge_[a-f0-9-]+$/.test(edge.id))).toBe(true);
    expect(graph.nodes[0].label).toBe('<b>Start</b>');
    expect(
      graph.edges.every(
        (edge) =>
          graph.nodes.some((node) => node.id === edge.from) &&
          graph.nodes.some((node) => node.id === edge.to),
      ),
    ).toBe(true);
    expect(() => materializeFlowchart(proposal, () => 'same-id')).toThrow();
  });
});

describe('deterministic isolated flowchart patches', () => {
  it('adds review on the approved branch, preserves the other branch, and reverses seven nodes to the exact six-node graph', () => {
    const six = sixNodeGraph(),
      before = structuredClone(six);
    const approved = resolveFlowBranch(six, 'Approved');
    const rejectedBefore = flowchartPaths(six).branches.find(
      (branch) => branch.label === 'Rejected',
    );
    const seven = applyFlowchartPatch(
      six,
      { type: 'insertProcessOnEdge', edgeId: approved, label: 'Accessibility review' },
      (kind) => `review_${kind}`,
    );
    expect(six).toEqual(before);
    expect(seven.nodes).toHaveLength(7);
    expect(
      flowchartPaths(seven).branches.find((branch) => branch.label === 'Approved')?.nodeIds,
    ).toEqual(['review_node', 'node_launch', 'node_launched']);
    expect(flowchartPaths(seven).branches.find((branch) => branch.label === 'Rejected')).toEqual(
      rejectedBefore,
    );
    expect(seven.edges.find((edge) => edge.id === approved)).toEqual({
      ...six.edges.find((edge) => edge.id === approved),
      to: 'review_node',
    });
    expect(seven.edges.filter((edge) => ![approved, 'review_edge'].includes(edge.id))).toEqual(
      six.edges.filter((edge) => edge.id !== approved),
    );
    expect(seven.nodes.filter((node) => node.id !== 'review_node')).toEqual(six.nodes);
    const serialized = JSON.parse(JSON.stringify(seven));
    expect(validateFlowchart(serialized)).toEqual(seven);
    const undone = applyFlowchartPatch(serialized, {
      type: 'removeProcessReconnect',
      nodeId: 'review_node',
    });
    expect(undone).toEqual(six);
    expect(JSON.parse(JSON.stringify(before))).toEqual(six); // Exact history restoration also needs no inference or ID assignment.
  });

  it('renames only selected text and relabels only the selected decision edge', () => {
    const graph = sixNodeGraph();
    const renamed = applyFlowchartPatch(graph, {
      type: 'renameNode',
      nodeId: 'node_revise',
      label: 'Revise campaign',
    });
    expect(renamed.edges).toEqual(graph.edges);
    expect(renamed.nodes.filter((node) => node.id !== 'node_revise')).toEqual(
      graph.nodes.filter((node) => node.id !== 'node_revise'),
    );
    const relabeled = applyFlowchartPatch(renamed, {
      type: 'relabelBranch',
      edgeId: 'edge_3',
      label: 'Needs revision',
    });
    expect(relabeled.nodes).toEqual(renamed.nodes);
    expect(relabeled.edges.filter((edge) => edge.id !== 'edge_3')).toEqual(
      renamed.edges.filter((edge) => edge.id !== 'edge_3'),
    );
    expect(
      flowchartPaths(relabeled).branches.find((branch) => branch.edgeId === 'edge_3')?.nodeIds,
    ).toEqual(['node_revise', 'node_revision']);
  });

  it.each<[string, FlowchartPatch]>([
    ['remove decision', { type: 'removeProcessReconnect', nodeId: 'node_approval' }],
    ['remove start', { type: 'removeProcessReconnect', nodeId: 'node_start' }],
    ['remove end', { type: 'removeProcessReconnect', nodeId: 'node_launched' }],
    ['rename missing node', { type: 'renameNode', nodeId: 'missing', label: 'Review' }],
    ['insert on missing edge', { type: 'insertProcessOnEdge', edgeId: 'missing', label: 'Review' }],
    ['label ordinary connection', { type: 'relabelBranch', edgeId: 'edge_0', label: 'Next' }],
    ['duplicate branch label', { type: 'relabelBranch', edgeId: 'edge_3', label: 'Approved' }],
    ['unchanged node wording', { type: 'renameNode', nodeId: 'node_launch', label: 'Launch' }],
    ['unchanged branch wording', { type: 'relabelBranch', edgeId: 'edge_1', label: 'Approved' }],
  ])('rejects %s without mutation', (_name, patch) => {
    const graph = sixNodeGraph(),
      before = structuredClone(graph);
    expect(() => applyFlowchartPatch(graph, patch)).toThrow();
    expect(graph).toEqual(before);
  });

  it('rejects an eighth node, a removed shared merge and removal of a branch’s only exclusive step', () => {
    const seven = applyFlowchartPatch(
      sixNodeGraph(),
      { type: 'insertProcessOnEdge', edgeId: 'edge_1', label: 'Review' },
      (kind) => `review_${kind}`,
    );
    const before = structuredClone(seven);
    expect(() =>
      applyFlowchartPatch(seven, {
        type: 'insertProcessOnEdge',
        edgeId: 'edge_3',
        label: 'Another review',
      }),
    ).toThrow('seven nodes');
    expect(seven).toEqual(before);
    const merged = mergedGraph(),
      saved = structuredClone(merged);
    expect(() =>
      applyFlowchartPatch(merged, { type: 'removeProcessReconnect', nodeId: 'node_merge' }),
    ).toThrow('shared merge');
    expect(() =>
      applyFlowchartPatch(merged, { type: 'removeProcessReconnect', nodeId: 'node_launch' }),
    ).toThrow('own step');
    expect(merged).toEqual(saved);
  });

  it('rejects an allocator collision without changing existing identities', () => {
    const graph = sixNodeGraph(),
      before = structuredClone(graph);
    expect(() =>
      applyFlowchartPatch(
        graph,
        { type: 'insertProcessOnEdge', edgeId: 'edge_1', label: 'Review' },
        () => 'node_start',
      ),
    ).toThrow();
    expect(graph).toEqual(before);
  });
});

describe('stored-edge exploration and narration', () => {
  it('resolves exact normalized labels or current IDs and asks about duplicate labels', () => {
    const graph = sixNodeGraph();
    expect(resolveFlowNode(graph, '  CAMPAIGN   approval ')).toBe('node_approval');
    expect(resolveFlowNode(graph, 'node_launch')).toBe('node_launch');
    expect(resolveFlowBranch(graph, ' rejected ')).toBe('edge_3');
    expect(resolveFlowBranch(graph, 'edge_1')).toBe('edge_1');
    expect(() => resolveFlowNode(graph, 'Campaign')).toThrow('full label');
    const duplicate = applyFlowchartPatch(graph, {
      type: 'renameNode',
      nodeId: 'node_revise',
      label: 'Launch',
    });
    expect(() => resolveFlowNode(duplicate, 'Launch')).toThrow('More than one');
    expect(resolveFlowNode(duplicate, 'node_revise')).toBe('node_revise');
    expect(() => resolveFlowBranch(graph, 'Approve')).toThrow('branch labels');
  });

  it('follows the actual rejected path regardless of array order and narrates a merge through the terminal', () => {
    const graph = sixNodeGraph();
    const reversed = {
      ...graph,
      nodes: [...graph.nodes].reverse(),
      edges: [...graph.edges].reverse(),
    };
    expect(flowchartPaths(reversed)).toEqual(flowchartPaths(graph));
    const rejected = narrateFlowchart(reversed, { kind: 'branch', edgeId: 'edge_3' });
    expect(rejected).toContain('Rejected');
    expect(rejected.indexOf('Revise')).toBeLessThan(rejected.indexOf('Revision required'));
    expect(rejected).not.toContain('Launch');
    expect(narrateFlowchart(reversed)).toBe(narrateFlowchart(graph));
    const merged = mergedGraph();
    const readback = narrateFlowchart(merged, { kind: 'branch', edgeId: 'edge_3' });
    expect(readback.indexOf('Revise')).toBeLessThan(readback.indexOf('Record outcome'));
    expect(readback.indexOf('Record outcome')).toBeLessThan(readback.indexOf('Finish'));
    expect(narrateFlowchart(merged, { kind: 'decision' })).toContain(
      'Both branches join at Record outcome',
    );
    expect(narrateFlowchart(merged, { kind: 'node', nodeId: 'node_merge' })).toContain(
      'Record outcome, then Finish',
    );
    expect(narrateFlowchart(graph, { kind: 'node', nodeId: 'node_start' })).toContain(
      'Decision: Campaign approval',
    );
    expect(narrateFlowchart(graph, { kind: 'node', nodeId: 'node_launched' })).toContain(
      'no further steps',
    );
  });

  it('does not narrate a stale node or branch by substituting another target', () => {
    const graph = sixNodeGraph();
    expect(() => narrateFlowchart(graph, { kind: 'node', nodeId: 'old_node' })).toThrow(
      'no longer',
    );
    expect(() => narrateFlowchart(graph, { kind: 'branch', edgeId: 'edge_0' })).toThrow(
      'no longer',
    );
  });
});
