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

const parseHexRgb = (hex: string): [number, number, number] => {
  const normalized = hex.replace('#', '');
  const chunk = normalized.length === 3
    ? normalized
        .split('')
        .map((char) => `${char}${char}`)
        .join('')
    : normalized;

  const int = Number.parseInt(chunk, 16);
  return [
    (int >> 16) & 255,
    (int >> 8) & 255,
    int & 255,
  ];
};

const backgroundVertexShader = `
precision mediump float;

attribute vec3 aPosition;
attribute vec2 aTexCoord;

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;

varying vec2 vTexCoord;

void main() {
  vTexCoord = aTexCoord;
  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
}
`;

const backgroundFragmentShader = `
precision mediump float;

varying vec2 vTexCoord;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_bgColor;
uniform vec3 u_stripeColor;
uniform float u_waveCount;
uniform float u_noiseScale;
uniform float u_zoom;

vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(vec4 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
  return mod289(((x * 34.0) + 10.0) * x);
}

vec4 taylorInvSqrt(vec4 r) {
  return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

void main() {
  vec2 uv = vTexCoord;
  uv.y = 1.0 - uv.y;
  vec2 zoomedUv = ((uv - 0.5) / max(u_zoom, 0.001)) + 0.5;

  vec2 aspectUv = vec2(zoomedUv.x, zoomedUv.y * (u_resolution.y / max(u_resolution.x, 1.0)));
  vec2 centered = aspectUv - vec2(0.5, u_resolution.y / max(u_resolution.x, 1.0) * 0.5);

  float warpX = snoise(vec3(zoomedUv * 1.65, u_time + 4.7)) * 0.28;
  float warpY = snoise(vec3(zoomedUv * 1.65 + vec2(11.3, -6.1), u_time + 9.2)) * 0.42;
  vec2 flow = centered + vec2(warpX, warpY);

  float ripple = snoise(vec3(zoomedUv * u_noiseScale + flow * 2.2 + vec2(18.7, -7.4), u_time));
  float contour = snoise(vec3(zoomedUv * u_noiseScale * 0.6 + vec2(-5.2, 14.1), u_time * 0.7 + 20.3));

  float stripePhase =
    flow.x * 7.2 +
    flow.y * 12.5 +
    ripple * 2.8 +
    contour * 1.4 +
    sin((flow.y + ripple * 0.6) * 4.55) * 0.55;

  float bandSignal = sin(stripePhase * (u_waveCount * 0.46));
  float blend = smoothstep(-0.16, 0.16, bandSignal);
  vec3 color = mix(u_bgColor, u_stripeColor, blend);

  gl_FragColor = vec4(color, 1.0);
}
`;

const VideoCanvas = forwardRef<VideoCanvasHandle, Props>(({ config, onPlaybackChange }, ref) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const p5InstanceRef = useRef<p5 | null>(null);
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const bgGraphicsRef = useRef<p5.Graphics | null>(null);
  const bgShaderRef = useRef<p5.Shader | null>(null);

  const wordsRef = useRef<string[]>([]);
  const wordStatesRef = useRef<WordState[]>([]);
  const previewTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const onPlaybackChangeRef = useRef<Props['onPlaybackChange']>(onPlaybackChange);

  useEffect(() => {
    onPlaybackChangeRef.current = onPlaybackChange;
  }, [onPlaybackChange]);

  const resetWordStates = () => {
    const targetLength = wordsRef.current.length;

    while (wordStatesRef.current.length < targetLength) {
      wordStatesRef.current.push({
        opacity: 0,
        yOffset: 32,
      });
    }

    wordStatesRef.current.length = targetLength;
    wordStatesRef.current.forEach((wordState) => {
      wordState.opacity = 0;
      wordState.yOffset = 32;
    });
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
    const [backgroundHex, stripeHex] = config.backgroundStyle.palette;
    const bgGraphics = bgGraphicsRef.current;
    const bgShader = bgShaderRef.current;

    if (!bgGraphics || !bgShader) {
      instance.background(backgroundHex);
      return;
    }

    const [bgR, bgG, bgB] = parseHexRgb(backgroundHex);
    const [stripeR, stripeG, stripeB] = parseHexRgb(stripeHex);
    const waveCount = Math.max(5, Math.min(14, Math.round(config.backgroundStyle.waveLayers)));
    const noiseScale = Math.max(0.001, config.backgroundStyle.noiseScale * 780);

    bgGraphics.shader(bgShader);
    bgShader.setUniform('u_time', time * 0.045);
    bgShader.setUniform('u_resolution', [bgGraphics.width, bgGraphics.height]);
    bgShader.setUniform('u_bgColor', [bgR / 255, bgG / 255, bgB / 255]);
    bgShader.setUniform('u_stripeColor', [stripeR / 255, stripeG / 255, stripeB / 255]);
    bgShader.setUniform('u_waveCount', waveCount);
    bgShader.setUniform('u_noiseScale', noiseScale);
    bgShader.setUniform('u_zoom', config.backgroundStyle.zoom);

    bgGraphics.push();
    bgGraphics.clear();
    bgGraphics.noStroke();
    bgGraphics.rectMode(instance.CENTER);
    bgGraphics.rect(0, 0, bgGraphics.width, bgGraphics.height);
    bgGraphics.pop();

    instance.drawingContext.imageSmoothingEnabled = true;
    instance.image(bgGraphics, 0, 0, instance.width, instance.height);
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
        instance.pixelDensity(1);
        const cnv = instance.createCanvas(config.dimensions.width, config.dimensions.height);
        cnv.parent(wrapperRef.current!);
        cnv.elt.style.width = '100%';
        cnv.elt.style.height = '100%';
        cnv.elt.style.display = 'block';
        canvasElementRef.current = cnv.elt;
        bgGraphicsRef.current = instance.createGraphics(
          config.dimensions.width,
          config.dimensions.height,
          instance.WEBGL,
        );
        bgGraphicsRef.current.pixelDensity(1);
        bgShaderRef.current = bgGraphicsRef.current.createShader(
          backgroundVertexShader,
          backgroundFragmentShader,
        );
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
      bgGraphicsRef.current?.remove();
      bgGraphicsRef.current = null;
      bgShaderRef.current = null;
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
