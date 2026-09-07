import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  buildH264Args,
  ffmpegInstallHint,
  findFfmpeg,
  shouldTranscode,
  transcodeToH264,
  type FfmpegRunner,
} from '../src/core/transcode.js';
import { finalizeRecording, resolveTranscodeMode } from '../src/core/recorder.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'transcode-test-'));
  tempDirs.push(dir);
  return dir;
}

/** Stands in for a real ffmpeg, recording every invocation. */
function fakeRunner(exitCode = 0): FfmpegRunner & { calls: { path: string; args: string[] }[] } {
  const calls: { path: string; args: string[] }[] = [];
  const runner = async (ffmpegPath: string, args: string[]) => {
    calls.push({ path: ffmpegPath, args });
    const output = args[args.length - 1];
    if (exitCode === 0 && output) fs.writeFileSync(output, 'fake-mp4');
    return { code: exitCode, stderr: exitCode === 0 ? '' : 'fake ffmpeg failure' };
  };
  return Object.assign(runner, { calls });
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('findFfmpeg', () => {
  it('returns null or an existing path, and never throws', async () => {
    const result = await findFfmpeg();
    expect(result === null || typeof result === 'string').toBe(true);
  });

  it('reports the first candidate that answers -version', async () => {
    const runner: FfmpegRunner = async (ffmpegPath) => ({
      code: ffmpegPath === 'ffmpeg' ? 0 : 1,
      stderr: '',
    });
    await expect(findFfmpeg(runner)).resolves.toBe('ffmpeg');
  });

  it('returns null when no candidate is executable', async () => {
    const runner: FfmpegRunner = async () => {
      throw new Error('ENOENT');
    };
    await expect(findFfmpeg(runner)).resolves.toBeNull();
  });
});

describe('buildH264Args', () => {
  it('encodes libx264 with a browser- and QuickTime-playable pixel format', () => {
    const args = buildH264Args('in.webm', 'out.mp4');
    expect(args).toContain('libx264');
    expect(args).toContain('yuv420p');
    expect(args).toContain('+faststart');
    expect(args[args.length - 1]).toBe('out.mp4');
  });
});

describe('shouldTranscode', () => {
  it('transcodes .mp4 but not .webm under auto', () => {
    expect(shouldTranscode('demo.mp4')).toBe(true);
    expect(shouldTranscode('demo.MP4', 'auto')).toBe(true);
    expect(shouldTranscode('demo.webm', 'auto')).toBe(false);
  });

  it('never transcodes when off, and always transcodes when required', () => {
    expect(shouldTranscode('demo.mp4', 'off')).toBe(false);
    expect(shouldTranscode('demo.webm', 'off')).toBe(false);
    expect(shouldTranscode('demo.webm', 'require')).toBe(true);
  });
});

describe('resolveTranscodeMode', () => {
  it('defaults to auto and honours the deprecated codec alias', () => {
    expect(resolveTranscodeMode({ outputPath: 'a.mp4', durationMs: 1 })).toBe('auto');
    expect(resolveTranscodeMode({ outputPath: 'a.mp4', durationMs: 1, codec: 'h264' })).toBe('auto');
    expect(resolveTranscodeMode({ outputPath: 'a.mp4', durationMs: 1, codec: 'vp8' })).toBe('off');
    expect(resolveTranscodeMode({ outputPath: 'a.mp4', durationMs: 1, codec: 'vp9' })).toBe('off');
    expect(
      resolveTranscodeMode({ outputPath: 'a.mp4', durationMs: 1, codec: 'vp8', transcode: 'require' })
    ).toBe('require');
  });
});

describe('transcodeToH264', () => {
  it('spawns ffmpeg with the H.264 argv and returns the absolute output path', async () => {
    const dir = makeTempDir();
    const input = path.join(dir, 'raw.webm');
    fs.writeFileSync(input, 'fake-webm');
    const runner = fakeRunner();

    const output = await transcodeToH264(input, path.join(dir, 'out.mp4'), {
      ffmpegPath: '/usr/bin/ffmpeg',
      runner,
    });

    expect(output).toBe(path.join(dir, 'out.mp4'));
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]!.path).toBe('/usr/bin/ffmpeg');
    expect(runner.calls[0]!.args).toContain('libx264');
    expect(runner.calls[0]!.args).toContain('yuv420p');
  });

  it('throws an actionable error naming the install command when ffmpeg is missing', async () => {
    const dir = makeTempDir();
    await expect(
      transcodeToH264(path.join(dir, 'raw.webm'), path.join(dir, 'out.mp4'), { ffmpegPath: null })
    ).rejects.toThrow(ffmpegInstallHint());
  });

  it('surfaces ffmpeg stderr on a non-zero exit', async () => {
    const dir = makeTempDir();
    await expect(
      transcodeToH264(path.join(dir, 'raw.webm'), path.join(dir, 'out.mp4'), {
        ffmpegPath: '/usr/bin/ffmpeg',
        runner: fakeRunner(1),
      })
    ).rejects.toThrow('fake ffmpeg failure');
  });
});

describe('finalizeRecording', () => {
  it('renames the raw recording when the target is .webm', async () => {
    const dir = makeTempDir();
    const recorded = path.join(dir, 'raw.webm');
    fs.writeFileSync(recorded, 'fake-webm');

    const result = await finalizeRecording(recorded, {
      outputPath: path.join(dir, 'demo.webm'),
      durationMs: 1,
    });

    expect(result).toBe(path.join(dir, 'demo.webm'));
    expect(fs.readFileSync(result, 'utf8')).toBe('fake-webm');
    expect(fs.existsSync(recorded)).toBe(false);
  });

  it('transcodes to H.264 for an .mp4 target and drops the raw file', async () => {
    const dir = makeTempDir();
    const recorded = path.join(dir, 'raw.webm');
    fs.writeFileSync(recorded, 'fake-webm');
    const calls: string[] = [];

    const result = await finalizeRecording(
      recorded,
      { outputPath: path.join(dir, 'demo.mp4'), durationMs: 1 },
      {
        transcodeToH264: async (input, output) => {
          calls.push(`${input} -> ${output}`);
          fs.writeFileSync(output, 'fake-mp4');
          return path.resolve(output);
        },
      }
    );

    expect(calls).toHaveLength(1);
    expect(result).toBe(path.join(dir, 'demo.mp4'));
    expect(fs.existsSync(recorded)).toBe(false);
  });

  it('never writes a WebM payload under an .mp4 name when no transcoder is available', async () => {
    const dir = makeTempDir();
    const recorded = path.join(dir, 'raw.webm');
    fs.writeFileSync(recorded, 'fake-webm');
    const target = path.join(dir, 'demo.mp4');

    await expect(
      finalizeRecording(
        recorded,
        { outputPath: target, durationMs: 1 },
        {
          transcodeToH264: async (_input, output) =>
            transcodeToH264(_input, output, { ffmpegPath: null }),
        }
      )
    ).rejects.toThrow(/ffmpeg is required/);

    // The old behaviour renamed the WebM onto the .mp4 path; that must be gone.
    expect(fs.existsSync(target)).toBe(false);
    expect(fs.existsSync(recorded)).toBe(true);
  });

  it("keeps a truthful .webm extension when transcoding is 'off'", async () => {
    const dir = makeTempDir();
    const recorded = path.join(dir, 'raw.webm');
    fs.writeFileSync(recorded, 'fake-webm');

    const result = await finalizeRecording(
      recorded,
      { outputPath: path.join(dir, 'demo.mp4'), durationMs: 1, transcode: 'off' },
      {
        transcodeToH264: async () => {
          throw new Error('should not transcode');
        },
      }
    );

    expect(result).toBe(path.join(dir, 'demo.webm'));
    expect(fs.existsSync(path.join(dir, 'demo.mp4'))).toBe(false);
  });
});
