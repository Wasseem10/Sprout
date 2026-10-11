import { describe, expect, it } from 'vitest';
import type { ComputerState } from '../shared/computer';
import { BuddyCompletionGate } from '../src/buddyCompletion';

function task(
  id: string,
  status: NonNullable<ComputerState['task']>['status'],
): NonNullable<ComputerState['task']> {
  return { id, status, goal: 'Local fixture', message: 'Fixture', steps: [] };
}

describe('confirmed companion completion', () => {
  it('ignores hydrated and repeated completion records across requests', () => {
    const gate = new BuddyCompletionGate();
    gate.seed(task('previous', 'completed'));
    expect(gate.accept(task('previous', 'completed'), 1, 1)).toBeNull();
    expect(gate.accept(task('fresh', 'completed'), 1, 1)).toBe('1:fresh');
    expect(gate.accept(task('fresh', 'completed'), 1, 1)).toBeNull();
    expect(gate.accept(task('fresh', 'completed'), 2, 2)).toBeNull();
  });

  it('never acknowledges stale, missing, failed, paused or waiting outcomes', () => {
    const gate = new BuddyCompletionGate();
    expect(gate.accept(task('late', 'completed'), 2, 3)).toBeNull();
    expect(gate.accept(undefined, 3, 3)).toBeNull();
    for (const status of ['running', 'failed', 'paused', 'waiting'] as const)
      expect(gate.accept(task(status, status), 3, 3)).toBeNull();
    expect(gate.accept(task('late', 'completed'), 3, 3)).toBe('3:late');
  });

  it('permits fresh completion of a previously running task', () => {
    const gate = new BuddyCompletionGate();
    gate.seed(task('running-at-mount', 'running'));
    expect(gate.accept(task('running-at-mount', 'completed'), 1, 1)).toBe('1:running-at-mount');
  });
});
