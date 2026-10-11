import type { ComputerState } from '../shared/computer';

/** Observes accepted results only. Voice playback and render timing never prove success. */
export class BuddyCompletionGate {
  private acknowledged = new Set<string>();

  seed(task: ComputerState['task']) {
    if (task?.status === 'completed') this.acknowledged.add(task.id);
  }

  accept(task: ComputerState['task'], requestGeneration: number, currentGeneration: number) {
    if (
      requestGeneration !== currentGeneration ||
      task?.status !== 'completed' ||
      this.acknowledged.has(task.id)
    )
      return null;
    this.acknowledged.add(task.id);
    return `${requestGeneration}:${task.id}`;
  }
}
