import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import { BrowserRecorder, finalizeRecording, DEMO_COMPLETE_FLAG } from '../src/core/recorder.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recorder-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('BrowserRecorder', () => {
  it('creates Playwright context with deviceScaleFactor 2 by default', async () => {
    const dir = makeTempDir();
    const recordedVideoPath = path.join(dir, 'fake-raw.webm');
    fs.writeFileSync(recordedVideoPath, 'fake-video-bytes');

    const newContextSpy = vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        setContent: vi.fn().mockResolvedValue(undefined),
        waitForFunction: vi.fn().mockResolvedValue(true),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        video: () => ({ path: async () => recordedVideoPath }),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    });

    vi.spyOn(chromium, 'launch').mockResolvedValue({
      newContext: newContextSpy,
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as import('playwright').Browser);

    const recorder = new BrowserRecorder(true);
    await recorder.recordHtml('<html><body>Test</body></html>', {
      outputPath: path.join(dir, 'out.webm'),
      durationMs: 100,
    });

    expect(newContextSpy).toHaveBeenCalledOnce();
    const contextArgs = newContextSpy.mock.calls[0]![0];
    expect(contextArgs.deviceScaleFactor).toBe(2);
  });

  it('honours custom deviceScaleFactor passed in RecordingOptions', async () => {
    const dir = makeTempDir();
    const recordedVideoPath = path.join(dir, 'fake-raw.webm');
    fs.writeFileSync(recordedVideoPath, 'fake-video-bytes');

    const newContextSpy = vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        setContent: vi.fn().mockResolvedValue(undefined),
        waitForFunction: vi.fn().mockResolvedValue(true),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        video: () => ({ path: async () => recordedVideoPath }),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    });

    vi.spyOn(chromium, 'launch').mockResolvedValue({
      newContext: newContextSpy,
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as import('playwright').Browser);

    const recorder = new BrowserRecorder(true);
    await recorder.recordHtml('<html><body>Test</body></html>', {
      outputPath: path.join(dir, 'out.webm'),
      durationMs: 100,
      deviceScaleFactor: 3,
    });

    expect(newContextSpy).toHaveBeenCalledOnce();
    const contextArgs = newContextSpy.mock.calls[0]![0];
    expect(contextArgs.deviceScaleFactor).toBe(3);
  });

  it('completes promptly when window.__DEMO_COMPLETE__ is signaled', async () => {
    const dir = makeTempDir();
    const recordedVideoPath = path.join(dir, 'fake-raw.webm');
    fs.writeFileSync(recordedVideoPath, 'fake-video-bytes');

    const timeoutCalls: number[] = [];
    const mockPage = {
      setContent: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockImplementation(async (_fn, flag) => {
        expect(flag).toBe(DEMO_COMPLETE_FLAG);
        return true;
      }),
      waitForTimeout: vi.fn().mockImplementation(async (ms: number) => {
        timeoutCalls.push(ms);
      }),
      close: vi.fn().mockResolvedValue(undefined),
      video: () => ({ path: async () => recordedVideoPath }),
    };

    vi.spyOn(chromium, 'launch').mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue(mockPage),
        close: vi.fn().mockResolvedValue(undefined),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as import('playwright').Browser);

    const recorder = new BrowserRecorder(true);
    // Request a long duration (30 seconds)
    const startTime = Date.now();
    const result = await recorder.recordHtml('<html><body>Test</body></html>', {
      outputPath: path.join(dir, 'out.webm'),
      durationMs: 30_000,
    });
    const elapsed = Date.now() - startTime;

    expect(result).toBe(path.join(dir, 'out.webm'));
    // Should NOT have waited the full 30,000ms
    expect(elapsed).toBeLessThan(5000);
    // Verify waitForTimeout was not called with the remaining 29+ seconds
    for (const ms of timeoutCalls) {
      expect(ms).toBeLessThan(1000);
    }
  });

  it('gracefully exports WebM when .mp4 is requested but ffmpeg is missing in auto mode', async () => {
    const dir = makeTempDir();
    const recorded = path.join(dir, 'raw.webm');
    fs.writeFileSync(recorded, 'raw-webm-bytes');

    const outputPath = path.join(dir, 'output', 'demo.mp4');
    const result = await finalizeRecording(
      recorded,
      {
        outputPath,
        durationMs: 1000,
      },
      {
        findFfmpeg: async () => null,
      }
    );

    expect(result).toBe(path.join(dir, 'output', 'demo.webm'));
    expect(fs.existsSync(result)).toBe(true);
    expect(fs.existsSync(outputPath)).toBe(false);
  });

  it('launches with specified browser engine and headed mode when requested', async () => {
    const dir = makeTempDir();
    const recordedVideoPath = path.join(dir, 'fake-raw.webm');
    fs.writeFileSync(recordedVideoPath, 'fake-video-bytes');

    const firefoxLaunchSpy = vi.spyOn(firefox, 'launch').mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue({
          setContent: vi.fn().mockResolvedValue(undefined),
          waitForFunction: vi.fn().mockResolvedValue(true),
          waitForTimeout: vi.fn().mockResolvedValue(undefined),
          close: vi.fn().mockResolvedValue(undefined),
          video: () => ({ path: async () => recordedVideoPath }),
        }),
        close: vi.fn().mockResolvedValue(undefined),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as import('playwright').Browser);

    const recorder = new BrowserRecorder(false, 'firefox');
    await recorder.recordHtml('<html><body>Test</body></html>', {
      outputPath: path.join(dir, 'out.webm'),
      durationMs: 100,
    });

    expect(firefoxLaunchSpy).toHaveBeenCalledOnce();
    expect(firefoxLaunchSpy).toHaveBeenCalledWith({ headless: false });
  });

  it('launches with webkit engine when requested via options object', async () => {
    const dir = makeTempDir();
    const recordedVideoPath = path.join(dir, 'fake-raw.webm');
    fs.writeFileSync(recordedVideoPath, 'fake-video-bytes');

    const webkitLaunchSpy = vi.spyOn(webkit, 'launch').mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue({
          setContent: vi.fn().mockResolvedValue(undefined),
          waitForFunction: vi.fn().mockResolvedValue(true),
          waitForTimeout: vi.fn().mockResolvedValue(undefined),
          close: vi.fn().mockResolvedValue(undefined),
          video: () => ({ path: async () => recordedVideoPath }),
        }),
        close: vi.fn().mockResolvedValue(undefined),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as import('playwright').Browser);

    const recorder = new BrowserRecorder({ headless: true, browser: 'webkit' });
    await recorder.recordHtml('<html><body>Test</body></html>', {
      outputPath: path.join(dir, 'out.webm'),
      durationMs: 100,
    });

    expect(webkitLaunchSpy).toHaveBeenCalledOnce();
    expect(webkitLaunchSpy).toHaveBeenCalledWith({ headless: true });
  });
});

