import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TranscodeMode } from '../types.js';

export interface FfmpegRunResult {
  code: number;
  stderr: string;
}

/** Runs ffmpeg. Injectable so tests can assert the argv without a real ffmpeg installed. */
export type FfmpegRunner = (ffmpegPath: string, args: string[]) => Promise<FfmpegRunResult>;

export interface TranscodeOptions {
  /** Explicit ffmpeg binary. Defaults to whatever `findFfmpeg()` locates. */
  ffmpegPath?: string | null;
  runner?: FfmpegRunner;
}

/** Platform-appropriate install instruction, used in the "no ffmpeg" error message. */
export function ffmpegInstallHint(platform: string = process.platform): string {
  if (platform === 'darwin') return 'brew install ffmpeg';
  if (platform === 'win32') return 'winget install Gyan.FFmpeg';
  return 'sudo apt-get install ffmpeg';
}

/**
 * `-pix_fmt yuv420p` is not optional: QuickTime and most browsers refuse to play the yuv444p that
 * libx264 would otherwise pick for a WebM source.
 */
export function buildH264Args(input: string, output: string): string[] {
  return [
    '-y',
    '-i',
    input,
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    output,
  ];
}

/** True when the requested output needs an ffmpeg pass rather than the raw WebM. */
export function shouldTranscode(outputPath: string, mode: TranscodeMode = 'auto'): boolean {
  if (mode === 'off') return false;
  if (mode === 'require') return true;
  return path.extname(outputPath).toLowerCase() === '.mp4';
}

const defaultRunner: FfmpegRunner = (ffmpegPath, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? -1, stderr }));
  });

/**
 * Locates an ffmpeg binary, honouring `FFMPEG_PATH`. Returns `null` when none is usable — it never
 * throws, so callers can decide whether a missing ffmpeg is fatal.
 */
export async function findFfmpeg(runner: FfmpegRunner = defaultRunner): Promise<string | null> {
  const candidates = [process.env.FFMPEG_PATH, 'ffmpeg'].filter(
    (candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0
  );

  for (const candidate of candidates) {
    try {
      const result = await runner(candidate, ['-version']);
      if (result.code === 0) return candidate;
    } catch {
      // Not on PATH / not executable — try the next candidate.
    }
  }

  return null;
}

/**
 * Transcodes a video to H.264 in an MP4 container.
 *
 * @throws when ffmpeg cannot be found (the message names the install command) or exits non-zero.
 */
export async function transcodeToH264(
  input: string,
  output: string,
  options: TranscodeOptions = {}
): Promise<string> {
  const runner = options.runner ?? defaultRunner;
  const ffmpegPath =
    options.ffmpegPath === undefined ? await findFfmpeg(runner) : options.ffmpegPath;

  if (!ffmpegPath) {
    throw new Error(
      `ffmpeg is required to produce H.264 output ("${output}") but was not found on PATH. ` +
        `Install it with \`${ffmpegInstallHint()}\`, set FFMPEG_PATH, ` +
        `or pass transcode: 'off' to keep the raw WebM recording.`
    );
  }

  const resolvedOutput = path.resolve(output);
  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });

  const result = await runner(ffmpegPath, buildH264Args(path.resolve(input), resolvedOutput));
  if (result.code !== 0) {
    throw new Error(
      `ffmpeg exited with code ${result.code} while transcoding "${input}" to "${resolvedOutput}".\n${result.stderr}`
    );
  }

  return resolvedOutput;
}
