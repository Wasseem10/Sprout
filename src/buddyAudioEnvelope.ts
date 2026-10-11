import type { AudioPresentationSample } from './audioPresentation';
import type { BuddyVisualState } from './AssistantSignal';

/** Presentation consumes measured numbers; capture/playback remain owned by voice. */
export class BuddyAudioEnvelope {
  private generation: number | null = null;
  private input = 0;
  private output = 0;

  sample(
    sample: AudioPresentationSample | undefined,
    phase: BuddyVisualState,
    now: number,
    dt: number,
  ) {
    if (!sample) {
      this.input = this.output = 0;
      this.generation = null;
      return 0;
    }
    if (
      sample.playbackGeneration !== this.generation ||
      !sample.outputPlaying ||
      phase !== 'speaking'
    ) {
      this.output = 0;
      this.generation = sample.playbackGeneration;
    }
    const fresh = (level: number | null, timestamp: number) =>
      level !== null &&
      Number.isFinite(level) &&
      Number.isFinite(timestamp) &&
      now >= timestamp &&
      now - timestamp <= 250;
    const inputValid = phase === 'listening' && fresh(sample.inputLevel, sample.inputSampledAt);
    const outputValid =
      phase === 'speaking' &&
      sample.outputPlaying &&
      fresh(sample.outputLevel, sample.outputSampledAt);
    const damp = (current: number, target: number) =>
      current +
      (target - current) * (1 - Math.exp(-(target > current ? 22 : 10) * Math.max(0, dt)));
    this.input = inputValid ? damp(this.input, Math.max(0, Math.min(1, sample.inputLevel!))) : 0;
    this.output = outputValid
      ? damp(this.output, Math.max(0, Math.min(1, sample.outputLevel!)))
      : 0;
    return phase === 'speaking' ? this.output : phase === 'listening' ? this.input : 0;
  }

  reset() {
    this.input = this.output = 0;
    this.generation = null;
  }
}
