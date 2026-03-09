export interface TimelineDurations {
  appearStaggerSec: number;
  disappearStaggerSec: number;
  appearDurationSec: number;
  disappearDurationSec: number;
  appearTotalSec: number;
  disappearTotalSec: number;
  pauseSec: number;
}

export const computeTimelineDurations = (
  wordsCount: number,
  totalDurationSec: number,
  speedMultiplier: number,
  appearStaggerMs = 120,
  disappearStaggerMs = 90,
  appearDurationSec = 0.35,
  disappearDurationSec = 0.28,
): TimelineDurations => {
  const safeWordCount = Math.max(1, wordsCount);
  const speed = Math.max(0.2, speedMultiplier);

  const appearStaggerSec = (appearStaggerMs / 1000) / speed;
  const disappearStaggerSec = (disappearStaggerMs / 1000) / speed;

  const rawAppearTotal = appearDurationSec + appearStaggerSec * (safeWordCount - 1);
  const rawDisappearTotal = disappearDurationSec + disappearStaggerSec * (safeWordCount - 1);

  const minPause = 0.15;
  const minNeeded = rawAppearTotal + rawDisappearTotal + minPause;

  if (totalDurationSec >= minNeeded) {
    return {
      appearStaggerSec,
      disappearStaggerSec,
      appearDurationSec,
      disappearDurationSec,
      appearTotalSec: rawAppearTotal,
      disappearTotalSec: rawDisappearTotal,
      pauseSec: totalDurationSec - rawAppearTotal - rawDisappearTotal,
    };
  }

  const availableForTransitions = Math.max(0.1, totalDurationSec - minPause);
  const scale = availableForTransitions / Math.max(rawAppearTotal + rawDisappearTotal, 0.001);

  const scaledAppearDuration = Math.max(0.08, appearDurationSec * scale);
  const scaledDisappearDuration = Math.max(0.08, disappearDurationSec * scale);
  const scaledAppearStagger = appearStaggerSec * scale;
  const scaledDisappearStagger = disappearStaggerSec * scale;

  const appearTotalSec = scaledAppearDuration + scaledAppearStagger * (safeWordCount - 1);
  const disappearTotalSec = scaledDisappearDuration + scaledDisappearStagger * (safeWordCount - 1);

  return {
    appearStaggerSec: scaledAppearStagger,
    disappearStaggerSec: scaledDisappearStagger,
    appearDurationSec: scaledAppearDuration,
    disappearDurationSec: scaledDisappearDuration,
    appearTotalSec,
    disappearTotalSec,
    pauseSec: Math.max(minPause, totalDurationSec - appearTotalSec - disappearTotalSec),
  };
};
