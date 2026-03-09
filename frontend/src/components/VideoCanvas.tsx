import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import p5 from 'p5';
import { gsap } from 'gsap';
import type { AnimationConfig } from '../types';
import { tokenizeWords } from '../lib/text';
import { wrapWordsIntoLines } from '../lib/layout';
import { computeTimelineDurations } from '../lib/timeline';

interface WordState {
  opacity: number;
  yOffset: number;
}

export interface PlaybackSnapshot {
  progress: number;
  currentTimeSec: number;
  durationSec: number;
  isPlaying: boolean;
}

export interface VideoCanvasHandle {
  playPreview: () => void;
  play: () => void;
  pause: () => void;
  setProgress: (progress: number) => void;
  recordWebm: () => Promise<Blob>;
}

interface Props {
  config: AnimationConfig;
  onPlaybackChange?: (snapshot: PlaybackSnapshot) => void;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const parseHexColor = (hex: string, alpha = 1): string => {
  const normalized = hex.replace('#', '');
  const chunk = normalized.length === 3
    ? normalized
        .split('')
        .map((char) => `${char}${char}`)
        .join('')
    : normalized;

  const int = Number.parseInt(chunk, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const marchingCases: Array<Array<[number, number]>> = [
  [],
  [[3, 0]],
  [[0, 1]],
  [[3, 1]],
  [[1, 2]],
  [[3, 2], [0, 1]],
  [[0, 2]],
  [[3, 2]],
  [[2, 3]],
  [[0, 2]],
  [[0, 3], [1, 2]],
  [[1, 2]],
  [[1, 3]],
  [[0, 1]],
  [[3, 0]],
  [],
];

const VideoCanvas = forwardRef<VideoCanvasHandle, Props>(({ config, onPlaybackChange }, ref) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const p5InstanceRef = useRef<p5 | null>(null);
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);

  const wordsRef = useRef<string[]>([]);
  const wordStatesRef = useRef<WordState[]>([]);
  const previewTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const onPlaybackChangeRef = useRef<Props['onPlaybackChange']>(onPlaybackChange);

  useEffect(() => {
    onPlaybackChangeRef.current = onPlaybackChange;
  }, [onPlaybackChange]);

  const resetWordStates = () => {
    wordStatesRef.current = wordsRef.current.map(() => ({
      opacity: 0,
      yOffset: 32,
    }));
  };

  const notifyPlayback = () => {
    const timeline = previewTimelineRef.current;
    if (!timeline) {
      return;
    }

    const durationSec = Math.max(0.001, timeline.duration());
    const currentTimeSec = timeline.time() % durationSec;

    onPlaybackChangeRef.current?.({
      progress: clamp01(currentTimeSec / durationSec),
      currentTimeSec,
      durationSec,
      isPlaying: !timeline.paused(),
    });
  };

  const killPreviewTimeline = () => {
    previewTimelineRef.current?.kill();
    previewTimelineRef.current = null;
  };

  const createWordTimeline = (params: {
    loop: boolean;
    onComplete?: () => void;
    onUpdate?: () => void;
  }) => {
    resetWordStates();

    const wordsCount = wordStatesRef.current.length;
    const durations = computeTimelineDurations(
      wordsCount,
      config.timing.totalDurationSec,
      config.timing.speedMultiplier,
      config.timing.appearStaggerMs,
      config.timing.disappearStaggerMs,
      config.timing.appearDurationSec,
      config.timing.disappearDurationSec,
    );

    const startExit = durations.appearTotalSec + durations.pauseSec;

    const timeline = gsap.timeline({
      paused: true,
      repeat: params.loop ? -1 : 0,
      onRepeat: () => {
        resetWordStates();
      },
      onComplete: params.onComplete,
      onUpdate: params.onUpdate,
    });

    wordStatesRef.current.forEach((wordState, index) => {
      timeline.to(
        wordState,
        {
          opacity: 1,
          yOffset: 0,
          duration: durations.appearDurationSec,
          ease: 'power3.out',
        },
        index * durations.appearStaggerSec,
      );
    });

    [...wordStatesRef.current]
      .reverse()
      .forEach((wordState, reverseIndex) => {
        timeline.to(
          wordState,
          {
            opacity: 0,
            yOffset: -22,
            duration: durations.disappearDurationSec,
            ease: 'power2.in',
          },
          startExit + reverseIndex * durations.disappearStaggerSec,
        );
      });

    return timeline;
  };

  const createAndStartPreviewTimeline = ({
    progress = 0,
    playing = true,
  }: {
    progress?: number;
    playing?: boolean;
  } = {}) => {
    killPreviewTimeline();
    const timeline = createWordTimeline({
      loop: true,
      onUpdate: notifyPlayback,
    });

    previewTimelineRef.current = timeline;
    timeline.progress(clamp01(progress));

    if (playing) {
      timeline.play();
    } else {
      timeline.pause();
    }

    notifyPlayback();
  };

  const drawBackground = (instance: p5, time: number) => {
    const [c1, c2, c3, c4] = config.backgroundStyle.palette;
    instance.background(c1);

    const contourCount = Math.max(6, Math.min(14, Math.round(config.backgroundStyle.waveLayers)));
    const cols = 30;
    const rows = Math.round((cols * instance.height) / instance.width);
    const cellW = instance.width / cols;
    const cellH = instance.height / rows;
    const noiseScale = Math.max(0.0008, config.backgroundStyle.noiseScale);

    const sampleField = (x: number, y: number): number => {
      const warpA = instance.noise(x * noiseScale * 0.65 + 9.1, y * noiseScale * 0.65 - 4.2, time * 0.08);
      const warpB = instance.noise(x * noiseScale * 0.65 - 13.4, y * noiseScale * 0.65 + 7.7, time * 0.08 + 12.4);

      const warpedX = x + instance.map(warpA, 0, 1, -260, 260);
      const warpedY = y + instance.map(warpB, 0, 1, -260, 260);

      const primary = instance.noise(warpedX * noiseScale, warpedY * noiseScale, time * 0.1);
      const secondary = instance.noise(warpedX * noiseScale * 1.8 + 40, warpedY * noiseScale * 1.8 - 25, time * 0.12);
      return primary * 0.78 + secondary * 0.22;
    };

    const field: number[][] = [];
    for (let y = 0; y <= rows; y += 1) {
      const row: number[] = [];
      for (let x = 0; x <= cols; x += 1) {
        row.push(sampleField(x * cellW, y * cellH));
      }
      field.push(row);
    }

    const levels = Array.from({ length: contourCount }, (_, i) =>
      instance.map(i, 0, contourCount - 1, 0.12, 0.88),
    );
    const strokePalette = [c2, c3, c4, c2, c3, c4];

    instance.noFill();
    instance.strokeCap(instance.ROUND);
    instance.strokeJoin(instance.ROUND);

    const interpolateEdge = (
      edge: number,
      x: number,
      y: number,
      v0: number,
      v1: number,
      v2: number,
      v3: number,
      level: number,
    ) => {
      const lerpPoint = (
        ax: number,
        ay: number,
        av: number,
        bx: number,
        by: number,
        bv: number,
      ) => {
        const denom = bv - av;
        const ratio = Math.abs(denom) < 1e-6 ? 0.5 : (level - av) / denom;
        return {
          x: instance.lerp(ax, bx, ratio),
          y: instance.lerp(ay, by, ratio),
        };
      };

      if (edge === 0) {
        return lerpPoint(x, y, v0, x + cellW, y, v1);
      }
      if (edge === 1) {
        return lerpPoint(x + cellW, y, v1, x + cellW, y + cellH, v2);
      }
      if (edge === 2) {
        return lerpPoint(x, y + cellH, v3, x + cellW, y + cellH, v2);
      }
      return lerpPoint(x, y, v0, x, y + cellH, v3);
    };

    levels.forEach((level, levelIndex) => {
      const color = instance.color(strokePalette[levelIndex % strokePalette.length]);
      color.setAlpha(228);
      instance.stroke(color);

      const levelT = levelIndex / Math.max(1, levels.length - 1);
      const weight = instance.map(Math.sin(levelT * Math.PI), 0, 1, 46, 108);
      instance.strokeWeight(weight);

      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const v0 = field[y][x];
          const v1 = field[y][x + 1];
          const v2 = field[y + 1][x + 1];
          const v3 = field[y + 1][x];

          const caseIndex =
            (v0 > level ? 1 : 0) |
            (v1 > level ? 2 : 0) |
            (v2 > level ? 4 : 0) |
            (v3 > level ? 8 : 0);

          const segments = marchingCases[caseIndex];
          if (!segments.length) {
            continue;
          }

          const px = x * cellW;
          const py = y * cellH;
          segments.forEach(([a, b]) => {
            const pA = interpolateEdge(a, px, py, v0, v1, v2, v3, level);
            const pB = interpolateEdge(b, px, py, v0, v1, v2, v3, level);
            instance.line(pA.x, pA.y, pB.x, pB.y);
          });
        }
      }
    });

    instance.noStroke();
    instance.fill(parseHexColor(c1, 0.1));
    instance.rect(0, 0, instance.width, instance.height);
  };

  const drawText = (instance: p5) => {
    if (!wordsRef.current.length) {
      return;
    }

    const ctx = instance.drawingContext as CanvasRenderingContext2D;
    const words = wordsRef.current;
    const maxWidth = config.dimensions.width * config.textStyle.maxWidthRatio;
    const maxHeight = config.dimensions.height * 0.62;

    const measureLayout = (fontSize: number) => {
      const spacing = Math.max(8, fontSize * 0.22);
      const fontSpec = `${config.textStyle.italic ? 'italic ' : ''}${config.textStyle.fontWeight} ${fontSize}px "${config.textStyle.fontFamily}", sans-serif`;

      ctx.font = fontSpec;
      const wrapped = wrapWordsIntoLines(
        words,
        maxWidth,
        (word) => ctx.measureText(word).width,
        spacing,
        fontSize,
      );

      const maxLineWidth = wrapped.lines.reduce((max, line) => Math.max(max, line.width), 0);
      const blockHeight = wrapped.lines.length * wrapped.lineHeight;

      return {
        fontSize,
        spacing,
        fontSpec,
        wrapped,
        maxLineWidth,
        blockHeight,
      };
    };

    let fitted = measureLayout(config.textSizePx);
    while ((fitted.maxLineWidth > maxWidth || fitted.blockHeight > maxHeight) && fitted.fontSize > 56) {
      fitted = measureLayout(fitted.fontSize - 4);
    }

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = fitted.fontSpec;

    const blockTop = config.dimensions.height * config.textYRatio - fitted.blockHeight / 2;

    let wordIndex = 0;
    fitted.wrapped.lines.forEach((line, lineIndex) => {
      const lineTop = blockTop + lineIndex * fitted.wrapped.lineHeight;
      const lineLeft = (config.dimensions.width - line.width) / 2;

      let cursorX = lineLeft;
      line.words.forEach((word) => {
        const state = wordStatesRef.current[wordIndex] ?? { opacity: 0, yOffset: 0 };
        const alpha = clamp01(state.opacity);
        const y = lineTop + state.yOffset;

        if (alpha > 0.001) {
          ctx.fillStyle = parseHexColor(config.textStyle.shadowColor, 0.24 * alpha);
          ctx.fillText(
            word,
            cursorX + config.textStyle.shadowOffsetX,
            y + config.textStyle.shadowOffsetY,
          );

          ctx.fillStyle = parseHexColor(config.textStyle.color, alpha);
          ctx.fillText(word, cursorX, y);
        }

        cursorX += ctx.measureText(word).width + fitted.spacing;
        wordIndex += 1;
      });
    });

    ctx.restore();
  };

  useEffect(() => {
    wordsRef.current = tokenizeWords(config.text).map((word) =>
      config.textStyle.uppercase ? word.toUpperCase() : word,
    );

    void document.fonts?.load(
      `${config.textStyle.italic ? 'italic ' : ''}${config.textStyle.fontWeight} ${config.textSizePx}px "${config.textStyle.fontFamily}"`,
    );

    if (!wrapperRef.current) {
      return;
    }

    if (p5InstanceRef.current) {
      createAndStartPreviewTimeline({ progress: 0, playing: true });
      return;
    }

    const sketch = (instance: p5) => {
      instance.setup = () => {
        const cnv = instance.createCanvas(config.dimensions.width, config.dimensions.height);
        cnv.parent(wrapperRef.current!);
        canvasElementRef.current = cnv.elt;
        instance.pixelDensity(1);
        createAndStartPreviewTimeline({ progress: 0, playing: true });
      };

      instance.draw = () => {
        const time = instance.millis() / 1000;
        drawBackground(instance, time);
        drawText(instance);
      };
    };

    p5InstanceRef.current = new p5(sketch);

    return () => {
      killPreviewTimeline();
      p5InstanceRef.current?.remove();
      p5InstanceRef.current = null;
      canvasElementRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  useImperativeHandle(ref, () => ({
    playPreview: () => {
      createAndStartPreviewTimeline({ progress: 0, playing: true });
    },
    play: () => {
      if (!previewTimelineRef.current) {
        createAndStartPreviewTimeline({ progress: 0, playing: true });
        return;
      }
      previewTimelineRef.current.play();
      notifyPlayback();
    },
    pause: () => {
      previewTimelineRef.current?.pause();
      notifyPlayback();
    },
    setProgress: (progress: number) => {
      const timeline = previewTimelineRef.current;
      if (!timeline) {
        createAndStartPreviewTimeline({ progress: clamp01(progress), playing: false });
        return;
      }

      const wasPlaying = !timeline.paused();
      timeline.pause();
      timeline.progress(clamp01(progress));

      if (wasPlaying) {
        timeline.play();
      }
      notifyPlayback();
    },
    recordWebm: async () => {
      const canvas = canvasElementRef.current;
      if (!canvas) {
        throw new Error('Canvas not ready');
      }

      const previewTimeline = previewTimelineRef.current;
      const previousProgress = previewTimeline?.progress() ?? 0;
      const wasPlaying = previewTimeline ? !previewTimeline.paused() : true;
      killPreviewTimeline();

      const stream = canvas.captureStream(config.timing.fps);
      const mimeType = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
      ].find((type) => MediaRecorder.isTypeSupported(type));

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];

      const blobPromise = new Promise<Blob>((resolve, reject) => {
        recorder.addEventListener('dataavailable', (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        });

        recorder.addEventListener('error', () => {
          reject(new Error('MediaRecorder failed during export.'));
        });

        recorder.addEventListener('stop', () => {
          resolve(new Blob(chunks, { type: 'video/webm' }));
        });
      });

      recorder.start();

      const exportTimeline = createWordTimeline({
        loop: false,
        onComplete: () => {
          window.setTimeout(() => {
            if (recorder.state !== 'inactive') {
              recorder.stop();
            }
            stream.getTracks().forEach((track) => track.stop());
            createAndStartPreviewTimeline({ progress: previousProgress, playing: wasPlaying });
          }, 120);
        },
      });

      exportTimeline.play(0);

      return blobPromise;
    },
  }));

  return (
    <div className="video-preview-shell">
      <div className="video-preview" ref={wrapperRef} />
    </div>
  );
});

VideoCanvas.displayName = 'VideoCanvas';

export default VideoCanvas;
