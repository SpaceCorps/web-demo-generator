import { chromium, type Browser, type Page } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RecordingOptions } from '../types.js';

export class BrowserRecorder {
  private headless: boolean;

  constructor(headless = true) {
    this.headless = headless;
  }

  /**
   * Loads an HTML string into a headless Chromium browser and records the animation
   * using Playwright's built-in video capture (H.264 / WebM / MP4).
   */
  async recordHtml(html: string, options: RecordingOptions): Promise<string> {
    const width = options.width ?? 1280;
    const height = options.height ?? 720;
    const durationMs = options.durationMs ?? 5000;

    const outputDir = path.dirname(options.outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const browser: Browser = await chromium.launch({
      headless: this.headless,
    });

    try {
      const context = await browser.newContext({
        viewport: { width, height },
        recordVideo: {
          dir: outputDir,
          size: { width, height },
        },
      });

      const page: Page = await context.newPage();
      await page.setContent(html, { waitUntil: 'networkidle' });

      // Wait for animation duration
      await page.waitForTimeout(durationMs);

      // Close page and context to finalize the video recording
      await page.close();
      await context.close();

      const video = page.video();
      if (!video) {
        throw new Error('Video recording failed: No video output found');
      }

      const recordedPath = await video.path();
      const finalPath = path.resolve(options.outputPath);

      // If recorded file name differs from target output path, rename it
      if (recordedPath !== finalPath) {
        if (fs.existsSync(finalPath)) {
          fs.unlinkSync(finalPath);
        }
        fs.renameSync(recordedPath, finalPath);
      }

      return finalPath;
    } finally {
      await browser.close();
    }
  }
}
