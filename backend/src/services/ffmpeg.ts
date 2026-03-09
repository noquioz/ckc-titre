import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ProbeResult } from '../types/api.js';

const runCommand = (
  binary: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${binary} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${binary} exited with code ${code}. ${stderr}`));
    });
  });

export const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true });
};

export const checkFfmpegAvailable = async (ffmpegBin = 'ffmpeg'): Promise<boolean> => {
  try {
    await runCommand(ffmpegBin, ['-version'], 10_000);
    return true;
  } catch {
    return false;
  }
};

export const transcodeToMp4 = async ({
  inputPath,
  outputPath,
  ffmpegBin = 'ffmpeg',
  fps = 30,
  timeoutMs = 120_000,
}: {
  inputPath: string;
  outputPath: string;
  ffmpegBin?: string;
  fps?: number;
  timeoutMs?: number;
}) => {
  await ensureDir(path.dirname(outputPath));

  const args = [
    '-y',
    '-i',
    inputPath,
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-vf',
    'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black',
    '-r',
    String(fps),
    outputPath,
  ];

  await runCommand(ffmpegBin, args, timeoutMs);
};

export const probeVideo = async ({
  inputPath,
  ffprobeBin = 'ffprobe',
  timeoutMs = 30_000,
}: {
  inputPath: string;
  ffprobeBin?: string;
  timeoutMs?: number;
}): Promise<ProbeResult> => {
  const args = [
    '-v',
    'error',
    '-show_streams',
    '-show_entries',
    'stream=codec_name,pix_fmt,width,height,duration',
    '-of',
    'json',
    inputPath,
  ];

  const { stdout } = await runCommand(ffprobeBin, args, timeoutMs);
  const parsed = JSON.parse(stdout) as {
    streams?: Array<{
      codec_name?: string;
      pix_fmt?: string;
      width?: number;
      height?: number;
      duration?: string;
    }>;
  };

  const stream = parsed.streams?.[0];
  if (!stream) {
    throw new Error('No stream returned by ffprobe.');
  }

  return {
    codec: stream.codec_name ?? 'unknown',
    pixFmt: stream.pix_fmt ?? 'unknown',
    width: stream.width ?? 0,
    height: stream.height ?? 0,
    durationSec: Number.parseFloat(stream.duration ?? '0') || 0,
  };
};

export const removeIfExists = async (filePath: string) => {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== 'ENOENT') {
      throw error;
    }
  }
};
