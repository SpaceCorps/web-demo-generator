export interface DemoPromptOptions {
  /** The natural language description or patchnote item describing the UI change */
  changeDescription: string;
  /** Optional URL of the live website or staging environment to mimic */
  targetUrl?: string;
  /** Optional HTML/CSS snippet or context of the component */
  componentContext?: string;
  /** Duration in seconds for the animation and recording */
  durationSeconds?: number;
  /** Output video file path (e.g. ./output/demo.mp4) */
  outputPath?: string;
}

export interface MimicPageResult {
  /** Self-contained HTML content simulating the UI and animation */
  html: string;
  /** Instructions or animation steps */
  steps: string[];
  /** Suggested recording duration in milliseconds */
  suggestedDurationMs: number;
}

/**
 * How a raw recording is turned into the requested output file.
 *
 * - `auto` (default): transcode to H.264 when the output extension is `.mp4`, otherwise keep the
 *   raw WebM that the browser produced.
 * - `require`: always transcode, whatever the extension. Fails when ffmpeg is missing.
 * - `off`: never transcode. A non-`.webm` output path is saved with a `.webm` extension instead,
 *   because the payload really is WebM.
 */
export type TranscodeMode = 'auto' | 'require' | 'off';

export interface RecordingOptions {
  /** Viewport width in pixels */
  width?: number;
  /** Viewport height in pixels */
  height?: number;
  /**
   * @deprecated The browser only ever records VP8/WebM, so this was never read. Use `transcode`.
   * Kept as an alias: `vp8`/`vp9` mean `transcode: 'off'`, `h264` means `transcode: 'auto'`.
   */
  codec?: 'h264' | 'vp8' | 'vp9';
  /** How to convert the raw WebM recording into the requested output (defaults to `auto`) */
  transcode?: TranscodeMode;
  /** Path where the video will be saved */
  outputPath: string;
  /** Recording duration in milliseconds */
  durationMs: number;
}

export interface DemoGeneratorConfig {
  /** Anthropic API Key (defaults to process.env.ANTHROPIC_API_KEY) */
  apiKey?: string;
  /** Model to use for prompting (e.g., claude-3-7-sonnet-20250219) */
  model?: string;
  /** Headless mode for browser recording */
  headless?: boolean;
}
