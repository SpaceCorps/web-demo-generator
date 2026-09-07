import { chromium, firefox, webkit, type Browser, type Page } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RecordingOptions, TranscodeMode, BrowserEngine } from '../types.js';
import { findFfmpeg, ffmpegInstallHint, shouldTranscode, transcodeToH264 } from './transcode.js';

/** Flag the synthetic page sets on `window` when demo animation completes. */
export const DEMO_COMPLETE_FLAG = '__DEMO_COMPLETE__';

/** Flag the harness sets on `window` after its first paint. */
export const HARNESS_READY_FLAG = '__HARNESS_READY__';

export type DemoInteraction =
  | { kind: 'wait'; ms: number }
  | { kind: 'click'; selector: string; settleMs?: number }
  | { kind: 'hover'; selector: string; settleMs?: number }
  | { kind: 'scrollTo'; selector: string; settleMs?: number };

export interface UrlRecordingOptions extends RecordingOptions {
  /** Replayed in order once the page signals readiness. */
  interactions?: DemoInteraction[];
  /** How long to wait for `window.__HARNESS_READY__` (defaults to 30s). */
  readyTimeoutMs?: number;
}

/** Injectable transcoding hooks so the post-processing can be tested without a real ffmpeg. */
export interface RecorderDeps {
  findFfmpeg?: typeof findFfmpeg;
  transcodeToH264?: typeof transcodeToH264;
}

/** Default settle time after an interaction, long enough for a CSS transition to be on camera. */
const DEFAULT_SETTLE_MS = 600;

/** Maps the deprecated `codec` field onto a transcode mode. */
export function resolveTranscodeMode(options: RecordingOptions): TranscodeMode {
  if (options.transcode) return options.transcode;
  if (options.codec === 'vp8' || options.codec === 'vp9') return 'off';
  return 'auto';
}

function moveFile(from: string, to: string): void {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (fs.existsSync(to)) fs.unlinkSync(to);
  try {
    fs.renameSync(from, to);
  } catch (error) {
    // Playwright may have written the raw file to another device (e.g. a temp volume).
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
    fs.copyFileSync(from, to);
    fs.unlinkSync(from);
  }
}

/**
 * Turns the raw recording Playwright produced (always WebM/VP8) into the requested output.
 *
 * Renaming is only ever valid when source and target are both `.webm`; anything else is either
 * transcoded or saved under a truthful `.webm` extension. A WebM payload is never given an `.mp4`
 * name.
 */
export async function finalizeRecording(
  recordedPath: string,
  options: RecordingOptions,
  deps: RecorderDeps = {}
): Promise<string> {
  const mode = resolveTranscodeMode(options);
  const target = path.resolve(options.outputPath);
  const findFfmpegFn =
    deps.findFfmpeg ?? (deps.transcodeToH264 ? async () => 'injected-transcoder' : findFfmpeg);

  if (shouldTranscode(target, mode)) {
    if (mode === 'auto') {
      const ffmpegPath = await findFfmpegFn();
      if (!ffmpegPath) {
        console.warn(
          `ffmpeg is not installed on PATH. Falling back to native WebM recording. Install ffmpeg with \`${ffmpegInstallHint()}\` to enable MP4 transcoding.`
        );
        const webmTarget = path.join(
          path.dirname(target),
          `${path.basename(target, path.extname(target))}.webm`
        );
        moveFile(recordedPath, webmTarget);
        return webmTarget;
      }
    }

    const transcode = deps.transcodeToH264 ?? transcodeToH264;
    let finalPath: string;
    try {
      finalPath = await transcode(recordedPath, target);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${message}\nThe raw WebM recording was kept at "${recordedPath}".`);
    }
    if (fs.existsSync(recordedPath) && path.resolve(recordedPath) !== finalPath) {
      fs.unlinkSync(recordedPath);
    }
    return finalPath;
  }

  if (path.extname(target).toLowerCase() === '.webm') {
    moveFile(recordedPath, target);
    return target;
  }

  // Not transcoding, so the payload stays WebM, and so must the extension.
  const webmTarget = path.join(
    path.dirname(target),
    `${path.basename(target, path.extname(target))}.webm`
  );
  moveFile(recordedPath, webmTarget);
  return webmTarget;
}

export interface BrowserRecorderOptions {
  headless?: boolean;
  browser?: BrowserEngine;
  browserEngine?: BrowserEngine;
  deps?: RecorderDeps;
}

export class BrowserRecorder {
  private headless: boolean;
  private browserEngine: BrowserEngine;
  private deps: RecorderDeps;

  constructor(
    headlessOrOptions: boolean | BrowserRecorderOptions = true,
    browserOrDeps?: BrowserEngine | RecorderDeps,
    depsOrBrowser?: RecorderDeps | BrowserEngine
  ) {
    if (typeof headlessOrOptions === 'object' && headlessOrOptions !== null) {
      this.headless = headlessOrOptions.headless ?? true;
      this.browserEngine =
        headlessOrOptions.browser ?? headlessOrOptions.browserEngine ?? 'chromium';
      this.deps = headlessOrOptions.deps ?? {};
    } else {
      this.headless = headlessOrOptions ?? true;
      let browser: BrowserEngine = 'chromium';
      let deps: RecorderDeps = {};

      if (typeof browserOrDeps === 'string') {
        browser = browserOrDeps;
        if (typeof depsOrBrowser === 'object' && depsOrBrowser !== null) {
          deps = depsOrBrowser;
        }
      } else if (typeof browserOrDeps === 'object' && browserOrDeps !== null) {
        deps = browserOrDeps;
        if (typeof depsOrBrowser === 'string') {
          browser = depsOrBrowser;
        }
      }

      this.browserEngine = browser;
      this.deps = deps;
    }
  }

  /**
   * Loads an HTML string into a browser and records it.
   *
   * The browser records WebM/VP8; an `.mp4` output path is transcoded to real H.264 afterwards.
   */
  async recordHtml(html: string, options: RecordingOptions): Promise<string> {
    return this.record(options, async (page) => {
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      const timeout = options.durationMs ?? 10000;
      try {
        await page.waitForFunction(
          (flag: string) => (window as unknown as Record<string, unknown>)[flag] === true,
          DEMO_COMPLETE_FLAG,
          { timeout }
        );
        return { earlyComplete: true };
      } catch {
        // Completion signal timed out or was not set; proceed to finalize recording with captured frames.
        return { earlyComplete: false };
      }
    });
  }

  /**
   * Records a URL (typically a ComponentHarness page) replaying scripted interactions.
   *
   * Waits for `window.__HARNESS_READY__` rather than network idle: a dashboard with running
   * spinners never reaches network idle.
   */
  async recordUrl(url: string, options: UrlRecordingOptions): Promise<string> {
    return this.record(options, async (page) => {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        (flag: string) => (window as unknown as Record<string, unknown>)[flag] === true,
        HARNESS_READY_FLAG,
        { timeout: options.readyTimeoutMs ?? 30_000 }
      );
      await replayInteractions(page, options.interactions ?? []);
    });
  }

  /**
   * Shared recording pipeline: launch, record while `drive` runs, hold for the remaining duration,
   * then finalize the video file.
   */
  private async record(
    options: RecordingOptions,
    drive: (page: Page) => Promise<{ earlyComplete?: boolean } | void>
  ): Promise<string> {
    const width = options.width ?? 1280;
    const height = options.height ?? 720;
    const deviceScaleFactor = options.deviceScaleFactor ?? 2;
    const durationMs = options.durationMs ?? 5000;

    const outputDir = path.dirname(path.resolve(options.outputPath));
    fs.mkdirSync(outputDir, { recursive: true });

    const launcher =
      this.browserEngine === 'firefox'
        ? firefox
        : this.browserEngine === 'webkit'
        ? webkit
        : chromium;
    const browser: Browser = await launcher.launch({ headless: this.headless });

    let recordedPath: string;
    try {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor,
        recordVideo: {
          dir: outputDir,
          size: { width, height },
        },
      });

      const page: Page = await context.newPage();
      const startedAt = Date.now();
      const driveResult = await drive(page);

      if (driveResult && typeof driveResult === 'object' && driveResult.earlyComplete) {
        // Small buffer to allow final frames to be captured by Playwright
        await page.waitForTimeout(200);
      } else {
        // Hold the shot for whatever is left of the requested duration.
        const remainingMs = durationMs - (Date.now() - startedAt);
        if (remainingMs > 0) {
          await page.waitForTimeout(remainingMs);
        }
      }

      // Close page and context to finalize the video recording
      await page.close();
      await context.close();

      const video = page.video();
      if (!video) {
        throw new Error('Video recording failed: No video output found');
      }
      recordedPath = await video.path();
    } finally {
      await browser.close();
    }

    return finalizeRecording(recordedPath, options, this.deps);
  }
}

async function replayInteractions(page: Page, interactions: DemoInteraction[]): Promise<void> {
  for (const interaction of interactions) {
    if (interaction.kind === 'wait') {
      await page.waitForTimeout(interaction.ms);
      continue;
    }

    const locator = page.locator(interaction.selector).first();
    switch (interaction.kind) {
      case 'click':
        await locator.click();
        break;
      case 'hover':
        await locator.hover();
        break;
      case 'scrollTo':
        await locator.scrollIntoViewIfNeeded();
        break;
    }

    await page.waitForTimeout(interaction.settleMs ?? DEFAULT_SETTLE_MS);
  }
}

/**
 * Scripted tour of the Tendril dashboard demo, using selectors verified against the component.
 *
 * KPI cards are plain `<div>`s with no click handler, so they are hovered and scrolled to rather
 * than clicked. The Git Activity / Pull Requests tabs only exist because the demo template fills
 * the dashboard's `TunnelQr` slot.
 */
export const TENDRIL_DASHBOARD_SCRIPT: DemoInteraction[] = [
  { kind: 'wait', ms: 900 },
  { kind: 'hover', selector: '.tdb-kpi', settleMs: 500 },
  { kind: 'scrollTo', selector: '.tdb-trend', settleMs: 500 },
  { kind: 'click', selector: 'button.tdb-tab:has-text("Total Plans")', settleMs: 900 },
  { kind: 'click', selector: 'button.tdb-tab:has-text("Total Cost")', settleMs: 900 },
  { kind: 'click', selector: 'button.tdb-tab:has-text("Pull Requests")', settleMs: 900 },
  { kind: 'click', selector: 'button.tdb-tab:has-text("Git Activity")', settleMs: 900 },
  { kind: 'hover', selector: 'button.tdb-status-item', settleMs: 500 },
  { kind: 'scrollTo', selector: '.tdb-factory', settleMs: 900 },
  { kind: 'hover', selector: 'button.tdb-job-row', settleMs: 700 },
];
