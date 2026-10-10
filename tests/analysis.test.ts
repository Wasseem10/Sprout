import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCsv, defaultComparison, analyzeLocal, percentChange } from '../shared/analysis';
const text = readFileSync('data/operations-synthetic.csv', 'utf8');
describe('Actual CSV calculations and operating coverage', () => {
  it('derives the comparison from the file and calculates raw totals', () => {
    const d = parseCsv(text, 'test', true),
      c = defaultComparison(d),
      r = analyzeLocal(d, c);
    expect(c.current.label).toBe('Q2 2026');
    expect(c.previous.label).toBe('Q1 2026');
    expect(r.previousTotal).toBe(134000);
    expect(r.currentTotal).toBe(204000);
    expect(r.regions[0].region).toBe('South');
    expect(r.includedRows).toBe(39);
    expect(r.percent).toBeCloseTo(52.238806);
  });
  it('excludes a mid-quarter opening even though it has rows in both quarters', () => {
    const d = parseCsv(text, 'test'),
      r = analyzeLocal(d, { ...defaultComparison(d), commonLocations: true });
    expect(d.rows.some((r) => r.location_id === 'S2' && r.date < '2026-04-01')).toBe(true);
    expect(r.previousTotal).toBe(126000);
    expect(r.currentTotal).toBe(141000);
    expect(r.regions[0].region).toBe('East');
    expect(r.includedLocations).toBe(5);
    expect(r.excludedLocations).toBe(2);
    expect(r.includedRows).toBe(30);
    expect(r.percent).toBeCloseTo(11.904761);
  });
  it('uses integer-cent sums and treats a zero denominator explicitly', () => {
    const d = parseCsv(
      'date,location_id,region,revenue,operating_start,operating_end\n2026-01-01,A,East,0,2025-01-01,\n2026-04-01,A,East,0.10,2025-01-01,\n2026-05-01,A,East,0.20,2025-01-01,',
      'cents',
    );
    const r = analyzeLocal(d, defaultComparison(d));
    expect(r.currentTotal).toBe(0.3);
    expect(r.percent).toBeNull();
    expect(percentChange(-100, -50)).toBe(50);
  });
  it('rejects duplicates, impossible dates, missing money, and contradictory metadata', () => {
    expect(() => parseCsv(text + text.split('\n')[1] + '\n', 'duplicate')).toThrow(/Duplicate/);
    expect(() => parseCsv(text.replace('2026-01-20', '2026-02-30'), 'bad')).toThrow(/real ISO/);
    expect(() => parseCsv(text.replace(',10000,', ',,'), 'bad')).toThrow(/revenue/);
    expect(() =>
      parseCsv(text.replace('2026-02-20,N1,North', '2026-02-20,N1,South'), 'bad'),
    ).toThrow(/Conflicting/);
  });
});
