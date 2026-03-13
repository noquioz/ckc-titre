import { useMemo, useRef, useState } from 'react';
import VideoCanvas, {
  type PlaybackSnapshot,
  type VideoCanvasHandle,
} from './components/VideoCanvas';
import type { AnimationConfig, ExportResponse } from './types';

const defaultConfig: AnimationConfig = {
  text: 'EXEMPLE DE TEXTE DE MA QUESTION ?',
  dimensions: {
    width: 1080,
    height: 1920,
  },
  textSizePx: 155,
  textYRatio: 0.5,
  textStyle: {
    fontFamily: 'Montserrat',
    fontWeight: 900,
    italic: true,
    uppercase: true,
    shadowColor: '#000000',
    shadowBlur: 4,
    shadowOffsetX: 0,
    shadowOffsetY: 9,
    color: '#ffffff',
    maxWidthRatio: 0.82,
  },
  backgroundStyle: {
    palette: ['#1f2036', '#8f6ad4', '#618ec6', '#4b4f8f'],
    noiseScale: 0.0019,
    waveLayers: 12,
    zoom: 1,
  },
  timing: {
    fps: 30,
    totalDurationSec: 8,
    speedMultiplier: 1,
    appearStaggerMs: 120,
    disappearStaggerMs: 90,
    appearDurationSec: 0.35,
    disappearDurationSec: 0.28,
  },
};

const palettes: Record<string, [string, string, string, string]> = {
  PurpleBlue: ['#1f2036', '#8f6ad4', '#618ec6', '#4b4f8f'],
  Sunset: ['#2a193b', '#ef6f6c', '#f4b860', '#5a4fcf'],
  NeonAqua: ['#0a1a21', '#2ad0c2', '#2997ff', '#104f84'],
};

const formatTime = (seconds: number): string => {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe - Math.floor(safe)) * 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
};

const isHexColor = (value: string): boolean => /^#([0-9a-f]{6})$/i.test(value.trim());

const normalizeHexColor = (value: string, fallback: string): string => {
  const trimmed = value.trim();
  if (isHexColor(trimmed)) {
    return trimmed.toLowerCase();
  }

  const withoutHash = trimmed.replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(withoutHash)) {
    return `#${withoutHash.split('').map((char) => `${char}${char}`).join('').toLowerCase()}`;
  }

  return fallback;
};

function App() {
  const canvasRef = useRef<VideoCanvasHandle | null>(null);

  const [text, setText] = useState(defaultConfig.text);
  const [durationSec, setDurationSec] = useState(defaultConfig.timing.totalDurationSec);
  const [fontSize, setFontSize] = useState(defaultConfig.textSizePx);
  const [textYRatio, setTextYRatio] = useState(defaultConfig.textYRatio);
  const [speedMultiplier, setSpeedMultiplier] = useState(defaultConfig.timing.speedMultiplier);
  const [paletteName, setPaletteName] = useState<keyof typeof palettes>('PurpleBlue');
  const [backgroundColor, setBackgroundColor] = useState(defaultConfig.backgroundStyle.palette[0]);
  const [stripeColor, setStripeColor] = useState(defaultConfig.backgroundStyle.palette[1]);
  const [backgroundZoom, setBackgroundZoom] = useState(defaultConfig.backgroundStyle.zoom);

  const [status, setStatus] = useState<string>('Prêt');
  const [exporting, setExporting] = useState(false);
  const [lastExport, setLastExport] = useState<ExportResponse | null>(null);
  const [playback, setPlayback] = useState<PlaybackSnapshot>({
    progress: 0,
    currentTimeSec: 0,
    durationSec,
    isPlaying: true,
  });

  const config = useMemo<AnimationConfig>(() => ({
    ...defaultConfig,
    text,
    textSizePx: fontSize,
    textYRatio,
    backgroundStyle: {
      ...defaultConfig.backgroundStyle,
      palette: [
        normalizeHexColor(backgroundColor, defaultConfig.backgroundStyle.palette[0]),
        normalizeHexColor(stripeColor, defaultConfig.backgroundStyle.palette[1]),
        palettes[paletteName][2],
        palettes[paletteName][3],
      ],
      zoom: backgroundZoom,
    },
    timing: {
      ...defaultConfig.timing,
      totalDurationSec: durationSec,
      speedMultiplier,
    },
  }), [backgroundColor, backgroundZoom, durationSec, fontSize, paletteName, speedMultiplier, stripeColor, text, textYRatio]);

  const handlePaletteChange = (palette: keyof typeof palettes) => {
    setPaletteName(palette);
    setBackgroundColor(palettes[palette][0]);
    setStripeColor(palettes[palette][1]);
  };

  const handlePreview = () => {
    canvasRef.current?.playPreview();
    setStatus('Prévisualisation relancée.');
  };

  const handleTogglePlayback = () => {
    if (!canvasRef.current) {
      return;
    }

    if (playback.isPlaying) {
      canvasRef.current.pause();
      setStatus('Lecture en pause.');
    } else {
      canvasRef.current.play();
      setStatus('Lecture en cours.');
    }
  };

  const handleTimelineScrub = (value: number) => {
    const progress = value / 1000;
    canvasRef.current?.setProgress(progress);
    setPlayback((current) => ({
      ...current,
      progress,
      currentTimeSec: progress * Math.max(current.durationSec, durationSec),
    }));
  };

  const handleExport = async () => {
    if (!canvasRef.current || exporting) {
      return;
    }

    setExporting(true);
    setStatus('Capture WebM en cours...');

    try {
      const webmBlob = await canvasRef.current.recordWebm();

      setStatus('Transcodage MP4 via FFmpeg...');
      const formData = new FormData();
      formData.append('video', webmBlob, 'capture.webm');
      formData.append('config', JSON.stringify(config));

      const response = await fetch('/api/export', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({ error: 'Export failed.' }));
        throw new Error(errorPayload.error ?? 'Export failed.');
      }

      const payload = (await response.json()) as ExportResponse;
      setLastExport(payload);
      setStatus('Export MP4 terminé.');

      const anchor = document.createElement('a');
      anchor.href = payload.downloadUrl;
      anchor.download = 'animated-text.mp4';
      anchor.click();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Erreur inattendue pendant export.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className="app-shell">
      <section className="panel left-panel">
        <h1>Animated Text Exporter</h1>
        <p className="subtitle">Création et export MP4 vertical (1080x1920).</p>

        <label>
          Texte
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={5}
            placeholder="Ton texte animé..."
          />
        </label>

        <label>
          Durée vidéo ({durationSec.toFixed(1)}s)
          <div className="inline-control">
            <input
              type="range"
              min={2}
              max={20}
              step={0.1}
              value={durationSec}
              onChange={(event) => setDurationSec(Number(event.target.value))}
            />
            <input
              type="number"
              min={2}
              max={20}
              step={0.1}
              value={durationSec}
              onChange={(event) => setDurationSec(Number(event.target.value))}
            />
          </div>
        </label>

        <div className="grid-two">
          <label>
            Taille texte (px)
            <input
              type="number"
              min={60}
              max={220}
              step={1}
              value={fontSize}
              onChange={(event) => setFontSize(Number(event.target.value))}
            />
          </label>

          <label>
            Vitesse mots ({speedMultiplier.toFixed(2)}x)
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={speedMultiplier}
              onChange={(event) => setSpeedMultiplier(Number(event.target.value))}
            />
          </label>
        </div>

        <label>
          Position verticale ({textYRatio.toFixed(2)})
          <input
            type="range"
            min={0.2}
            max={0.8}
            step={0.01}
            value={textYRatio}
            onChange={(event) => setTextYRatio(Number(event.target.value))}
          />
        </label>

        <label>
          Preset fond
          <select
            value={paletteName}
            onChange={(event) => handlePaletteChange(event.target.value as keyof typeof palettes)}
          >
            {Object.keys(palettes).map((palette) => (
              <option key={palette} value={palette}>
                {palette}
              </option>
            ))}
          </select>
        </label>

        <div className="grid-two color-grid">
          <label>
            Couleur fond
            <div className="color-control">
              <input
                type="color"
                className="color-picker"
                value={normalizeHexColor(backgroundColor, defaultConfig.backgroundStyle.palette[0])}
                onChange={(event) => setBackgroundColor(event.target.value)}
              />
              <input
                type="text"
                value={backgroundColor}
                onChange={(event) => setBackgroundColor(event.target.value)}
                placeholder="#1f2036"
                spellCheck={false}
              />
            </div>
          </label>

          <label>
            Couleur lignes
            <div className="color-control">
              <input
                type="color"
                className="color-picker"
                value={normalizeHexColor(stripeColor, defaultConfig.backgroundStyle.palette[1])}
                onChange={(event) => setStripeColor(event.target.value)}
              />
              <input
                type="text"
                value={stripeColor}
                onChange={(event) => setStripeColor(event.target.value)}
                placeholder="#8f6ad4"
                spellCheck={false}
              />
            </div>
          </label>
        </div>

        <label>
          Zoom fond ({backgroundZoom.toFixed(2)}x)
          <input
            type="range"
            min={0.75}
            max={2.5}
            step={0.05}
            value={backgroundZoom}
            onChange={(event) => setBackgroundZoom(Number(event.target.value))}
          />
        </label>

        <div className="actions">
          <button type="button" onClick={handlePreview} disabled={exporting}>
            Rejouer
          </button>
          <button type="button" onClick={handleExport} disabled={exporting} className="primary">
            {exporting ? 'Export en cours...' : 'Exporter MP4'}
          </button>
        </div>

        <div className="status-line">{status}</div>
        {lastExport ? (
          <a href={lastExport.downloadUrl} className="download-link">
            Télécharger le dernier MP4 ({lastExport.resolution}, {lastExport.codec})
          </a>
        ) : null}
      </section>

      <section className="panel right-panel">
        <VideoCanvas
          ref={canvasRef}
          config={config}
          onPlaybackChange={(snapshot) => setPlayback(snapshot)}
        />

        <div className="playback-controls">
          <div className="playback-row">
            <button
              type="button"
              className="playback-button"
              onClick={handleTogglePlayback}
              disabled={exporting}
            >
              {playback.isPlaying ? 'Pause' : 'Play'}
            </button>
            <span className="time-readout">
              {formatTime(playback.currentTimeSec)} / {formatTime(playback.durationSec)}
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={1000}
            step={1}
            value={Math.round(playback.progress * 1000)}
            onChange={(event) => handleTimelineScrub(Number(event.target.value))}
            disabled={exporting}
          />
        </div>
      </section>
    </main>
  );
}

export default App;
