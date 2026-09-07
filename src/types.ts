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

export interface RecordingOptions {
  /** Viewport width in pixels */
  width?: number;
  /** Viewport height in pixels */
  height?: number;
  /** Output video codec (defaults to h264) */
  codec?: 'h264' | 'vp8' | 'vp9';
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
