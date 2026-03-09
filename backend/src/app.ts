import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkFfmpegAvailable,
  ensureDir,
  probeVideo,
  removeIfExists,
  transcodeToMp4,
} from './services/ffmpeg.js';
import type { AnimationConfig, ExportResponse } from './types/api.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(currentDir, '..');
const repoRoot = path.resolve(backendRoot, '..');

export interface AppOptions {
  ffmpegBin?: string;
  ffprobeBin?: string;
  uploadsDir?: string;
  exportsDir?: string;
  serveFrontend?: boolean;
}

export const defaultPaths = {
  uploadsDir: path.join(backendRoot, '.tmp', 'uploads'),
  exportsDir: path.join(backendRoot, '.tmp', 'exports'),
  frontendDistDir: path.join(repoRoot, 'frontend', 'dist'),
};

export const createApp = async (options: AppOptions = {}) => {
  const ffmpegBin = options.ffmpegBin ?? process.env.FFMPEG_BIN ?? 'ffmpeg';
  const ffprobeBin = options.ffprobeBin ?? process.env.FFPROBE_BIN ?? 'ffprobe';
  const uploadsDir = options.uploadsDir ?? defaultPaths.uploadsDir;
  const exportsDir = options.exportsDir ?? defaultPaths.exportsDir;
  const serveFrontend = options.serveFrontend ?? true;

  await ensureDir(uploadsDir);
  await ensureDir(exportsDir);

  const upload = multer({
    dest: uploadsDir,
    limits: {
      fileSize: 500 * 1024 * 1024,
    },
  });

  const app = express();
  app.use(cors());

  app.get('/api/health', async (_request, response) => {
    const ffmpegAvailable = await checkFfmpegAvailable(ffmpegBin);
    response.json({
      status: ffmpegAvailable ? 'ok' : 'degraded',
      ffmpegAvailable,
    });
  });

  app.post('/api/export', upload.single('video'), async (request, response) => {
    const uploadedFile = request.file;
    if (!uploadedFile) {
      response.status(400).json({ error: 'Missing video file in `video` field.' });
      return;
    }

    let parsedConfig: AnimationConfig | null = null;
    if (typeof request.body.config === 'string') {
      try {
        parsedConfig = JSON.parse(request.body.config) as AnimationConfig;
      } catch {
        response.status(400).json({ error: 'Invalid JSON in `config` field.' });
        await removeIfExists(uploadedFile.path);
        return;
      }
    }

    const outputName = `export-${Date.now()}-${Math.random().toString(16).slice(2)}.mp4`;
    const outputPath = path.join(exportsDir, outputName);

    try {
      await transcodeToMp4({
        inputPath: uploadedFile.path,
        outputPath,
        ffmpegBin,
        fps: parsedConfig?.timing?.fps ?? 30,
      });

      const probe = await probeVideo({ inputPath: outputPath, ffprobeBin });
      const payload: ExportResponse = {
        downloadUrl: `/api/downloads/${outputName}`,
        durationSec: parsedConfig?.timing?.totalDurationSec ?? probe.durationSec,
        resolution: `${probe.width}x${probe.height}`,
        codec: probe.codec,
      };

      response.json(payload);
    } catch (error) {
      response.status(500).json({
        error: error instanceof Error ? error.message : 'Transcoding failed.',
      });
    } finally {
      await removeIfExists(uploadedFile.path);
    }
  });

  app.use('/api/downloads', express.static(exportsDir, {
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    },
  }));

  if (serveFrontend) {
    try {
      await fs.access(defaultPaths.frontendDistDir);
      app.use(express.static(defaultPaths.frontendDistDir));
      app.get(/^(?!\/api).*/, (_request, response) => {
        response.sendFile(path.join(defaultPaths.frontendDistDir, 'index.html'));
      });
    } catch {
      // Frontend dist not available in dev mode.
    }
  }

  return app;
};
