import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { analyzeLocal, datasetVersion } from '../shared/analysis';
import type { Comparison, DataRow, Dataset } from '../shared/schema';
import type { StudioState } from '../shared/studio';
import {
  chartSnapshotSeries,
  verifiedChartSnapshotSchema,
  type VerifiedChartSnapshot,
} from '../shared/presentation-chart-snapshot';
import {
  assertChartSnapshotCurrent,
  buildVerifiedChartSnapshot,
  captureStudioChartBinding,
  ChartSnapshotError,
  describeChartSnapshot,
  validateChartSnapshotIntegrity,
} from '../server/computer/presentation-chart-snapshot';

const now = new Date('2026-10-11T12:00:00.000Z');
const comparison: Comparison = {
  previous: { label: 'Q1 2026', start: '2026-01-01', end: '2026-03-31' },
  current: { label: 'Q2 2026', start: '2026-04-01', end: '2026-06-30' },
  commonLocations: true,
};

function row(
  region: string,
  location: string,
  date: string,
  revenue: number,
  start = '2025-01-01',
): DataRow {
  return {
    region,
    location_id: location,
    date,
    revenue,
    operating_start: start,
    operating_end: null,
  };
}
function studio(
  rows: DataRow[] = [
    row('North', 'A', '2026-01-02', -10.1),
    row('North', 'A', '2026-04-02', -5.05),
    row('South', 'B', '2026-01-02', 20.2),
    row('South', 'B', '2026-04-02', 30.35),
    row('East', 'C', '2026-01-02', 0),
    row('East', 'C', '2026-04-02', 7.07),
    row('North', 'NEW', '2026-04-02', 99.99, '2026-04-01'),
    row('North', 'A', '2026-07-02', 4.44),
  ],
  commonLocations = true,
): StudioState {
  const dataset: Dataset = { id: 'data-1', name: 'Operations.csv', synthetic: true, rows };
  // A mocked completed Databricks result: these tests do not contact a provider.
  const result = analyzeLocal(dataset, { ...comparison, commonLocations });
  result.provider = 'databricks';
  result.id = 'analysis-1';
  result.createdAt = '2026-10-11T11:59:00.000Z';
  result.queryReference = `Databricks statement stmt-1; table \`private_catalog\`.\`private_schema\`.\`ops_${datasetVersion(dataset).slice(0, 24)}\``;
  return {
    workspace: {
      moduleId: 'data',
      schemaVersion: 1,
      title: 'Analysis',
      dataset,
      result,
      view: { kind: 'chart', topN: null },
      projectId: null,
    },
    baseline: structuredClone(result),
    revision: 3,
    sourceSheet: 'Original records',
    sourceRows: rows.map((_, i) => 2 + i * 2),
    lastChange: '',
    evidence: [],
    canUndo: false,
    interpretation: 'hugging-face',
    outputs: { excel: null, powerpoint: null },
  };
}
function build(state = studio()) {
  return buildVerifiedChartSnapshot(state, captureStudioChartBinding(state), now);
}
function expectCode(action: () => unknown, code: ChartSnapshotError['code']) {
  try {
    action();
    throw new Error('Expected a chart boundary rejection.');
  } catch (error) {
    expect(error).toBeInstanceOf(ChartSnapshotError);
    expect((error as ChartSnapshotError).code).toBe(code);
  }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function rehash(value: VerifiedChartSnapshot) {
  const { snapshotHash: _, ...payload } = value;
  value.snapshotHash = createHash('sha256').update(canonical(payload)).digest('hex');
  return value;
}

describe('verified chart snapshot foundation (no controller or live provider)', () => {
  it('derives exact integer cents, ordered categories and row evidence from the completed result', () => {
    const source = studio(),
      before = structuredClone(source);
    const { snapshot, localEvidence } = build(source);
    expect(snapshot.categories).toEqual(['South', 'East', 'North']);
    expect(snapshot.series.map((s) => s.valuesCents)).toEqual([
      [2020, 0, -1010],
      [3035, 707, -505],
    ]);
    expect(snapshot.totals.full).toEqual({
      previousCents: 1010,
      currentCents: 3237,
      deltaCents: 2227,
      percent: (2227 / 1010) * 100,
    });
    expect(snapshot.counts).toEqual({
      sourceRows: 8,
      relevantRows: 7,
      includedRows: 6,
      excludedLocationRows: 1,
      outsidePeriodRows: 1,
      includedLocations: 3,
      excludedLocations: 1,
    });
    expect(snapshot.categoryRows).toEqual(
      ['South', 'East', 'North'].map((region) => ({ region, previous: 1, current: 1 })),
    );
    expect(localEvidence.rows[6]).toMatchObject({
      datasetRow: 6,
      sourceRow: 14,
      period: 'current',
      status: 'excluded-location',
    });
    expect(localEvidence.rows[7]).toMatchObject({
      sourceRow: 16,
      period: null,
      status: 'outside-periods',
    });
    expect(validateChartSnapshotIntegrity(snapshot)).toEqual(snapshot);
    expect(() => assertChartSnapshotCurrent(snapshot, source, now)).not.toThrow();
    expect(source).toEqual(before);
    expect(Object.isFrozen(snapshot.series[0].valuesCents)).toBe(true);
    expect(Object.isFrozen(localEvidence.rows[0])).toBe(true);
  });

  it('keeps exact source category/name/sheet labels rather than silently normalizing them after hashing', () => {
    const source = studio([row(' West ', 'A', '2026-01-02', 1), row('West', 'B', '2026-04-02', 2)]);
    source.workspace.dataset!.name = ' Operations.csv ';
    source.sourceSheet = ' Original records ';
    const { snapshot } = build(source);
    expect(new Set(snapshot.categories)).toEqual(new Set([' West ', 'West']));
    expect(snapshot.dataset.name).toBe(' Operations.csv ');
    expect(snapshot.dataset.sourceSheet).toBe(' Original records ');
    expect(validateChartSnapshotIntegrity(snapshot)).toEqual(snapshot);
  });

  it('separates explicit top-N display totals from full totals and never pads omitted regions with zero', () => {
    const source = studio();
    source.workspace.view.topN = 1;
    const { snapshot } = build(source);
    expect(snapshot.categories).toEqual(['South']);
    expect(snapshot.scope).toMatchObject({
      mode: 'top-n',
      requestedTopN: 1,
      fullCategoryCount: 3,
      omittedCategoryCount: 2,
    });
    expect(snapshot.totals.displayed).toMatchObject({ previousCents: 2020, currentCents: 3035 });
    expect(snapshot.totals.full).toMatchObject({ previousCents: 1010, currentCents: 3237 });
    expect(chartSnapshotSeries(snapshot)).toEqual([
      { name: 'Q1 2026', labels: ['South'], values: [20.2] },
      { name: 'Q2 2026', labels: ['South'], values: [30.35] },
    ]);
    const narration = describeChartSnapshot(snapshot);
    expect(narration).toContain('Fictional sample.');
    expect(narration).toContain('2 regions are omitted. Totals cover all included regions.');
    expect(narration).toContain('not a fresh live query');
  });

  it('retains an explicit top-N scope larger than the available categories without inventing categories', () => {
    const source = studio();
    source.workspace.view.topN = 10;
    const { snapshot } = build(source);
    expect(snapshot.scope).toMatchObject({
      requestedTopN: 10,
      fullCategoryCount: 3,
      omittedCategoryCount: 0,
    });
    expect(snapshot.categories).toHaveLength(3);
    expect(snapshot.totals.displayed).toEqual(snapshot.totals.full);
  });

  it('applies the current continuous-location filter, not the baseline result', () => {
    const source = studio(undefined, false),
      { snapshot } = build(source);
    expect(snapshot.analysis.locationRule).toBe('all-reported');
    expect(snapshot.counts).toMatchObject({
      includedRows: 7,
      excludedLocationRows: 0,
      includedLocations: 4,
      excludedLocations: 0,
    });
    expect(snapshot.categories[0]).toBe('North');
    expect(snapshot.totals.full.currentCents).toBe(13236);
  });

  it.each([
    [0, 0, null],
    [0, 0.03, null],
    [-0.1, 0.2, 300],
    [0.1, 0.3, 200],
  ])('keeps cents and defined denominator behavior for %s to %s', (previous, current, percent) => {
    const { snapshot } = build(
      studio([row('East', 'A', '2026-01-02', previous!), row('East', 'A', '2026-04-02', current!)]),
    );
    expect(snapshot.totals.full).toMatchObject({
      previousCents: Math.round(previous! * 100),
      currentCents: Math.round(current! * 100),
      percent,
    });
    if (previous === 0) expect(describeChartSnapshot(snapshot)).toContain('Growth is undefined');
  });

  it('retains a category present in only one selected period as a source-grounded zero in the other', () => {
    const { snapshot } = build(studio([row('Only current', 'A', '2026-04-02', 1.23)]));
    expect(snapshot.series.map((s) => s.valuesCents)).toEqual([[0], [123]]);
    expect(snapshot.categoryRows).toEqual([{ region: 'Only current', previous: 0, current: 1 }]);
  });

  it('aggregates decimal rows in integer cents and supports the bounded source maximum without precision loss', () => {
    const decimal = build(
      studio([
        row('East', 'A', '2026-01-02', 0.1),
        row('East', 'A', '2026-02-02', 0.2),
        row('East', 'A', '2026-04-02', 0.3),
      ]),
    ).snapshot;
    expect(decimal.totals.full).toEqual({
      previousCents: 30,
      currentCents: 30,
      deltaCents: 0,
      percent: 0,
    });
    const maximum = build(
      studio(
        Array.from({ length: 2500 }, (_, i) => [
          row('East', `L${i}`, '2026-01-02', 100_000_000),
          row('East', `L${i}`, '2026-04-02', -100_000_000),
        ]).flat(),
      ),
    ).snapshot;
    expect(maximum.totals.full).toEqual({
      previousCents: 25_000_000_000_000,
      currentCents: -25_000_000_000_000,
      deltaCents: -50_000_000_000_000,
      percent: -200,
    });
    expect(maximum.counts.includedRows).toBe(5000);
  });

  it('uses a stable region-name tiebreak independent of provider row order', () => {
    const source = studio([
      row('West', 'W', '2026-01-02', 0),
      row('West', 'W', '2026-04-02', 1),
      row('East', 'E', '2026-01-02', 0),
      row('East', 'E', '2026-04-02', -1),
    ]);
    source.workspace.result!.regions.reverse();
    expect(build(source).snapshot.categories).toEqual(['East', 'West']);
  });

  it('rejects an empty filtered result and requires explicit category selection above the display ceiling', () => {
    expectCode(
      () => build(studio([row('New', 'N', '2026-04-02', 1, '2026-04-01')])),
      'empty_result',
    );
    const source = studio(
      Array.from({ length: 13 }, (_, i) => row(`Region ${i}`, `L${i}`, '2026-04-02', i)),
    );
    expectCode(() => build(source), 'category_limit');
    source.workspace.view.topN = 13;
    expectCode(() => build(source), 'category_limit');
    source.workspace.view.topN = 12;
    expect(build(source).snapshot.scope).toMatchObject({
      fullCategoryCount: 13,
      omittedCategoryCount: 1,
    });
  });

  it.each([
    [
      'revision',
      (s: StudioState) => {
        s.revision++;
      },
    ],
    [
      'source values',
      (s: StudioState) => {
        s.workspace.dataset!.rows[0].revenue++;
      },
    ],
    [
      'source row order',
      (s: StudioState) => {
        s.workspace.dataset!.rows.reverse();
      },
    ],
    [
      'source row mapping',
      (s: StudioState) => {
        s.sourceRows![0] = 100;
      },
    ],
    [
      'source sheet',
      (s: StudioState) => {
        s.sourceSheet = 'Other sheet';
      },
    ],
    [
      'source name',
      (s: StudioState) => {
        s.workspace.dataset!.name = 'Other.csv';
      },
    ],
    [
      'synthetic marker',
      (s: StudioState) => {
        s.workspace.dataset!.synthetic = false;
      },
    ],
    [
      'category scope',
      (s: StudioState) => {
        s.workspace.view.topN = 1;
      },
    ],
    [
      'location filter',
      (s: StudioState) => {
        s.workspace.result!.comparison.commonLocations = false;
      },
    ],
    [
      'period',
      (s: StudioState) => {
        s.workspace.result!.comparison.current.end = '2026-05-31';
      },
    ],
    [
      'result',
      (s: StudioState) => {
        s.workspace.result!.currentTotal++;
      },
    ],
    [
      'verification',
      (s: StudioState) => {
        s.workspace.result!.queryReference = s.workspace.result!.queryReference.replace(
          'stmt-1',
          'stmt-2',
        );
      },
    ],
  ] as const)(
    'invalidates a captured binding and a prepared snapshot when %s changes',
    (_, mutate) => {
      const source = studio(),
        binding = captureStudioChartBinding(source),
        { snapshot } = build(source);
      mutate(source);
      expectCode(() => buildVerifiedChartSnapshot(source, binding, now), 'stale_analysis');
      expectCode(() => assertChartSnapshotCurrent(snapshot, source, now), 'stale_analysis');
    },
  );

  it.each([
    [
      'local result',
      (s: StudioState) => {
        s.workspace.result!.provider = 'local-sample';
      },
    ],
    [
      'missing evidence',
      (s: StudioState) => {
        s.workspace.result!.queryReference = '';
      },
    ],
    [
      'foreign source table',
      (s: StudioState) => {
        s.workspace.result!.queryReference = s.workspace.result!.queryReference.replace(
          /ops_[a-f0-9]{24}/,
          `ops_${'a'.repeat(24)}`,
        );
      },
    ],
    [
      'future timestamp',
      (s: StudioState) => {
        s.workspace.result!.createdAt = '2026-10-11T12:01:00.000Z';
      },
    ],
    [
      'invalid timestamp',
      (s: StudioState) => {
        s.workspace.result!.createdAt = 'yesterday';
      },
    ],
  ] as const)('rejects %s as Databricks verification', (_, mutate) => {
    const source = studio();
    mutate(source);
    expectCode(() => build(source), 'unverified_analysis');
  });

  it.each([
    [
      'total',
      (s: StudioState) => {
        s.workspace.result!.currentTotal += 0.01;
      },
    ],
    [
      'region value',
      (s: StudioState) => {
        s.workspace.result!.regions[0].current += 0.01;
      },
    ],
    [
      'fractional cent',
      (s: StudioState) => {
        s.workspace.result!.regions[0].current += 0.001;
      },
    ],
    [
      'row count',
      (s: StudioState) => {
        s.workspace.result!.regions[0].rowCount++;
      },
    ],
    [
      'location count',
      (s: StudioState) => {
        s.workspace.result!.includedLocations++;
      },
    ],
    [
      'percentage',
      (s: StudioState) => {
        s.workspace.result!.percent = 22;
      },
    ],
    [
      'region percentage',
      (s: StudioState) => {
        s.workspace.result!.regions[0].percent = 22;
      },
    ],
    [
      'category identity',
      (s: StudioState) => {
        s.workspace.result!.regions[0].region = 'Invented';
      },
    ],
  ] as const)(
    'reconciles provider %s against actual source records before snapshot creation',
    (_, mutate) => {
      const source = studio();
      mutate(source);
      expectCode(() => build(source), 'reconciliation_failed');
    },
  );

  it.each([
    [
      'duplicate row pointers',
      (s: StudioState) => {
        s.sourceRows![1] = s.sourceRows![0];
      },
    ],
    [
      'missing row pointer',
      (s: StudioState) => {
        s.sourceRows!.pop();
      },
    ],
    [
      'out of bounds row pointer',
      (s: StudioState) => {
        s.sourceRows![0] = 1_048_577;
      },
    ],
    [
      'fractional source cents',
      (s: StudioState) => {
        s.workspace.dataset!.rows[0].revenue = 1.001;
      },
    ],
    [
      'absolute source path',
      (s: StudioState) => {
        s.workspace.dataset!.name = 'C:\\private\\records.csv';
      },
    ],
  ] as const)('rejects invalid %s', (_, mutate) => {
    const source = studio();
    mutate(source);
    expectCode(() => build(source), 'invalid_source');
  });

  it('persists only bounded snapshot values and a local evidence reference, not raw rows or private table names', () => {
    const { snapshot, localEvidence } = build();
    const json = JSON.stringify(snapshot);
    for (const forbidden of [
      'location_id',
      'operating_start',
      'datasetRow',
      'private_catalog',
      'private_schema',
      'sourceRows":[',
      'revenue":',
    ])
      expect(json).not.toContain(forbidden);
    expect(localEvidence.rows).toHaveLength(8);
    expect(snapshot.verification.statementId).toBe('stmt-1');
    expect(snapshot.evidence.localReference).toBe(
      `studio-row-evidence:${snapshot.evidence.sha256}`,
    );
    expect(validateChartSnapshotIntegrity(JSON.parse(json))).toEqual(snapshot);
  });

  it('distinguishes snapshot corruption detection from authenticity of a trusted server result', () => {
    const snapshot = structuredClone(build().snapshot);
    snapshot.dataset.name = 'Forged name.csv';
    expectCode(() => validateChartSnapshotIntegrity(snapshot), 'invalid_snapshot');
    // A hash is deliberately not an authentication signature. The current-source check must
    // independently reconstruct server-owned evidence before committing a supplied snapshot.
    rehash(snapshot);
    expect(validateChartSnapshotIntegrity(snapshot)).toEqual(snapshot);
    expectCode(() => assertChartSnapshotCurrent(snapshot, studio(), now), 'stale_analysis');
  });

  it('rejects internally consistent changed amounts even when every public snapshot hash is recomputed', () => {
    const snapshot = structuredClone(build().snapshot);
    snapshot.series[1].valuesCents[0] += 100;
    for (const total of [snapshot.totals.full, snapshot.totals.displayed]) {
      total.currentCents += 100;
      total.deltaCents = total.currentCents - total.previousCents;
      total.percent = (total.deltaCents / Math.abs(total.previousCents)) * 100;
    }
    rehash(snapshot);
    expect(validateChartSnapshotIntegrity(snapshot)).toEqual(snapshot);
    expectCode(() => assertChartSnapshotCurrent(snapshot, studio(), now), 'stale_analysis');
  });

  it.each([
    [
      'fractional cents',
      (s: VerifiedChartSnapshot) => {
        s.series[0].valuesCents[0] = 1.2;
      },
    ],
    [
      'unsafe cents',
      (s: VerifiedChartSnapshot) => {
        s.series[0].valuesCents[0] = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      'series category length',
      (s: VerifiedChartSnapshot) => {
        s.series[0].valuesCents.pop();
      },
    ],
    [
      'period order',
      (s: VerifiedChartSnapshot) => {
        s.series.reverse();
      },
    ],
    [
      'duplicate category',
      (s: VerifiedChartSnapshot) => {
        s.categories[1] = s.categories[0];
      },
    ],
    [
      'category row order',
      (s: VerifiedChartSnapshot) => {
        s.categoryRows.reverse();
      },
    ],
    [
      'missing included row accounting',
      (s: VerifiedChartSnapshot) => {
        s.categoryRows[0].previous = 0;
      },
    ],
    [
      'empty included category',
      (s: VerifiedChartSnapshot) => {
        s.categoryRows[0].previous = 0;
        s.categoryRows[0].current = 0;
      },
    ],
    [
      'source row accounting',
      (s: VerifiedChartSnapshot) => {
        s.counts.outsidePeriodRows++;
      },
    ],
    [
      'impossible location count',
      (s: VerifiedChartSnapshot) => {
        s.counts.includedLocations = s.counts.includedRows + 1;
      },
    ],
    [
      'all-scope omission',
      (s: VerifiedChartSnapshot) => {
        s.scope.omittedCategoryCount = 1;
        s.scope.fullCategoryCount++;
      },
    ],
    [
      'top-N count',
      (s: VerifiedChartSnapshot) => {
        s.scope.mode = 'top-n';
        s.scope.requestedTopN = 1;
      },
    ],
    [
      'full chart totals',
      (s: VerifiedChartSnapshot) => {
        s.totals.full = { previousCents: 0, currentCents: 0, deltaCents: 0, percent: null };
      },
    ],
    [
      'wrong denominator',
      (s: VerifiedChartSnapshot) => {
        s.totals.full.percent = 0;
      },
    ],
    [
      'location rule',
      (s: VerifiedChartSnapshot) => {
        s.analysis.locationRule = 'all-reported';
      },
    ],
    [
      'evidence reference',
      (s: VerifiedChartSnapshot) => {
        s.evidence.sha256 = 'b'.repeat(64);
      },
    ],
  ] as const)('rejects persisted invariant violation: %s', (_, mutate) => {
    const snapshot = structuredClone(build().snapshot);
    mutate(snapshot);
    expect(verifiedChartSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });
});
