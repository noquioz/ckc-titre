export interface Dimensions {
  width: number;
  height: number;
}

export interface TextStyle {
  fontFamily: string;
  fontWeight: number;
  italic: boolean;
  uppercase: boolean;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  color: string;
  maxWidthRatio: number;
}

export interface BackgroundStyle {
  palette: [string, string, string, string];
  noiseScale: number;
  waveLayers: number;
}

export interface TimingStyle {
  fps: number;
  totalDurationSec: number;
  speedMultiplier: number;
  appearStaggerMs: number;
  disappearStaggerMs: number;
  appearDurationSec: number;
  disappearDurationSec: number;
}

export interface AnimationConfig {
  text: string;
  dimensions: Dimensions;
  textSizePx: number;
  textYRatio: number;
  textStyle: TextStyle;
  backgroundStyle: BackgroundStyle;
  timing: TimingStyle;
}

export interface ExportResponse {
  downloadUrl: string;
  durationSec: number;
  resolution: string;
  codec: string;
}
