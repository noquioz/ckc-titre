import { describe, expect, it } from 'vitest';
import { computeTimelineDurations } from './timeline';

describe('computeTimelineDurations', () => {
  it('fits in total duration when there is enough room', () => {
    const result = computeTimelineDurations(8, 8, 1);
    const total = result.appearTotalSec + result.pauseSec + result.disappearTotalSec;

    expect(total).toBeCloseTo(8, 3);
    expect(result.pauseSec).toBeGreaterThan(0);
  });

  it('scales durations down when total duration is too short', () => {
    const result = computeTimelineDurations(16, 1.5, 1);
    const total = result.appearTotalSec + result.pauseSec + result.disappearTotalSec;

    expect(total).toBeLessThanOrEqual(1.51);
    expect(result.pauseSec).toBeGreaterThanOrEqual(0.15);
  });
});
