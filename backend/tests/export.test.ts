import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createApp } from '../src/app.js';
import { probeVideo } from '../src/services/ffmpeg.js';

const run = (binary: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${binary} failed with code ${code}: ${stderr}`));
    });
  });

describe('Export API', () => {
  let tmpDir = '';
  let fixtureWebm = '';
  let exportsDir = '';
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'animated-export-test-'));
    const uploadsDir = path.join(tmpDir, 'uploads');
    exportsDir = path.join(tmpDir, 'exports');
    fixtureWebm = path.join(tmpDir, 'fixture.webm');

    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.mkdir(exportsDir, { recursive: true });

    await run('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=1080x1920:d=1',
      '-r',
      '30',
      fixtureWebm,
    ]);

    app = await createApp({
      uploadsDir,
      exportsDir,
      serveFrontend: false,
    });
  }, 90_000);

  afterAll(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns 400 when file is missing', async () => {
    const response = await request(app).post('/api/export');
    expect(response.status).toBe(400);
  });

  it('transcodes WebM to MP4 h264/yuv420p in 1080x1920', async () => {
    const response = await request(app)
      .post('/api/export')
      .attach('video', fixtureWebm)
      .field('config', JSON.stringify({ timing: { fps: 30, totalDurationSec: 2 } }));

    expect(response.status).toBe(200);
    expect(response.body.downloadUrl).toMatch(/^\/api\/downloads\//);

    const outputName = String(response.body.downloadUrl).split('/').pop();
    const outputPath = path.join(exportsDir, outputName);

    const probe = await probeVideo({ inputPath: outputPath });
    expect(probe.codec).toContain('h264');
    expect(probe.pixFmt).toBe('yuv420p');
    expect(probe.width).toBe(1080);
    expect(probe.height).toBe(1920);
  }, 120_000);

  it('fails cleanly when ffmpeg is unavailable', async () => {
    const brokenApp = await createApp({
      ffmpegBin: 'ffmpeg-unavailable-binary',
      uploadsDir: path.join(tmpDir, 'uploads-broken'),
      exportsDir: path.join(tmpDir, 'exports-broken'),
      serveFrontend: false,
    });

    const response = await request(brokenApp)
      .post('/api/export')
      .attach('video', fixtureWebm)
      .field('config', JSON.stringify({ timing: { fps: 30, totalDurationSec: 2 } }));

    expect(response.status).toBe(500);
    expect(response.body.error).toMatch(/ffmpeg-unavailable-binary/);
  }, 120_000);
});
