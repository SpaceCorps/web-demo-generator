import { PromptingEngine } from './core/prompting.js';
import { BrowserRecorder, TENDRIL_DASHBOARD_SCRIPT, type DemoInteraction } from './core/recorder.js';
import { ComponentHarness, type HarnessOptions } from './core/harness.js';
import type { DemoPromptOptions, DemoGeneratorConfig, TranscodeMode } from './types.js';
import * as path from 'node:path';

export * from './types.js';
export { PromptingEngine } from './core/prompting.js';
export {
  BrowserRecorder,
  TENDRIL_DASHBOARD_SCRIPT,
  HARNESS_READY_FLAG,
  finalizeRecording,
  resolveTranscodeMode,
  type DemoInteraction,
  type UrlRecordingOptions,
  type RecorderDeps,
} from './core/recorder.js';
export {
  ComponentHarness,
  resolveComponentsPath,
  componentsAvailable,
  type HarnessOptions,
} from './core/harness.js';
export {
  findFfmpeg,
  transcodeToH264,
  shouldTranscode,
  buildH264Args,
  ffmpegInstallHint,
  type FfmpegRunner,
  type FfmpegRunResult,
  type TranscodeOptions,
} from './core/transcode.js';
export {
  TEMPLATES,
  templateIds,
  resolveTemplateModule,
  type TemplateId,
} from './templates/index.js';
export * from './fixtures/index.js';

export interface ComponentDemoOptions {
  /** Template id from the registry, e.g. 'tendril/TendrilDashboardDemo'. */
  template: string;
  /** Prop overrides merged over the template's fixture. */
  props?: Record<string, unknown>;
  theme?: HarnessOptions['theme'];
  density?: HarnessOptions['density'];
  componentsPath?: string;
  port?: number;
  width?: number;
  height?: number;
  /** Output video path. An `.mp4` extension requires ffmpeg. */
  outputPath?: string;
  durationMs?: number;
  transcode?: TranscodeMode;
  /** Defaults to the scripted dashboard tour. */
  interactions?: DemoInteraction[];
}

export class WebDemoGenerator {
  private prompting: PromptingEngine;
  private recorder: BrowserRecorder;

  constructor(config?: DemoGeneratorConfig) {
    this.prompting = new PromptingEngine(config?.apiKey, config?.model);
    this.recorder = new BrowserRecorder(config?.headless ?? true);
  }

  /**
   * Generates an animated mimic page using Claude and records it as a video.
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
    });

    return {
      videoPath,
      steps: mimicResult.steps,
    };
  }

  /**
   * Records a real component template through the harness — authentic markup, stylesheet and theme
   * tokens instead of a page Claude guessed. The harness is always stopped, so a failed recording
   * never leaves a Vite server listening.
   */
  async generateComponentDemo(options: ComponentDemoOptions): Promise<{ videoPath: string }> {
    const harness = new ComponentHarness();
    try {
      const { url } = await harness.start({
        template: options.template,
        props: options.props,
        theme: options.theme,
        density: options.density,
        componentsPath: options.componentsPath,
        port: options.port,
      });

      const videoPath = await this.recorder.recordUrl(url, {
        outputPath: options.outputPath ?? path.join('output', 'component-demo.mp4'),
        durationMs: options.durationMs ?? 12_000,
        width: options.width ?? 1600,
        height: options.height ?? 1000,
        transcode: options.transcode,
        interactions: options.interactions ?? TENDRIL_DASHBOARD_SCRIPT,
      });

      return { videoPath };
    } finally {
      await harness.stop();
    }
  }
}
