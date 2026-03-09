export interface AnimationConfig {
  text: string;
  dimensions: {
    width: number;
    height: number;
  };
  timing: {
    totalDurationSec: number;
    fps: number;
  };
}

export interface ExportResponse {
  downloadUrl: string;
  durationSec: number;
  resolution: string;
  codec: string;
}

export interface ProbeResult {
  codec: string;
  pixFmt: string;
  width: number;
  height: number;
  durationSec: number;
}
