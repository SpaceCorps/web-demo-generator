import { PromptingEngine } from './core/prompting.js';
import { BrowserRecorder } from './core/recorder.js';
import type { DemoPromptOptions, DemoGeneratorConfig } from './types.js';
import * as path from 'node:path';

export * from './types.js';
export { PromptingEngine } from './core/prompting.js';
export { BrowserRecorder } from './core/recorder.js';

export class WebDemoGenerator {
  private prompting: PromptingEngine;
  private recorder: BrowserRecorder;

  constructor(config?: DemoGeneratorConfig) {
    this.prompting = new PromptingEngine(config?.apiKey, config?.model);
    this.recorder = new BrowserRecorder(config?.headless ?? true);
  }

  /**
   * Generates an animated mimic page using Claude and records it as an H.264 video.
   * Ideal for release patchnotes, changelog showcases, and automated PR demos.
   */
  async generateDemo(options: DemoPromptOptions): Promise<{ videoPath: string; steps: string[] }> {
    const mimicResult = await this.prompting.generateMimicPage(options);
    const durationMs = options.durationSeconds
      ? options.durationSeconds * 1000
      : mimicResult.suggestedDurationMs;
    const outputPath = options.outputPath ?? path.join('output', 'demo.webm');

    const videoPath = await this.recorder.recordHtml(mimicResult.html, {
      durationMs,
      outputPath,
      codec: 'h264',
    });

    return {
      videoPath,
      steps: mimicResult.steps,
    };
  }
}
