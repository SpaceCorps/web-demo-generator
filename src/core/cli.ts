import { parseArgs } from 'node:util';
import * as path from 'node:path';
import { WebDemoGenerator } from '../index.js';
import type { DemoGeneratorConfig, DemoGenerationResult } from '../types.js';

export interface CliOptions {
  prompt?: string;
  outputDir: string;
  format: 'webm' | 'mp4' | 'auto';
  browser: 'chromium' | 'firefox' | 'webkit';
  headed: boolean;
  width: number;
  height: number;
  dpi: number;
  json: boolean;
  help: boolean;
  outputPath: string;
}

export interface CliDeps {
  generator?: WebDemoGenerator;
  createGenerator?: (config?: DemoGeneratorConfig) => WebDemoGenerator;
  stdout?: (msg: string) => void;
  stderr?: (msg: string) => void;
}

export function parseCliArgs(argv: string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      prompt: { type: 'string', short: 'p' },
      'output-dir': { type: 'string', short: 'o', default: './output' },
      format: { type: 'string', short: 'f', default: 'auto' },
      browser: { type: 'string', short: 'b', default: 'chromium' },
      headed: { type: 'boolean', default: false },
      viewport: { type: 'string', short: 'v' },
      width: { type: 'string' },
      height: { type: 'string' },
      dpi: { type: 'string', default: '2' },
      'device-scale-factor': { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
    strict: false,
  });

  const getString = (val: unknown): string | undefined => (typeof val === 'string' ? val : undefined);

  let prompt = getString(values.prompt);
  if (!prompt && positionals.length > 0) {
    prompt = positionals.join(' ');
  }

  const outputDir = getString(values['output-dir']) ?? './output';

  let format: 'webm' | 'mp4' | 'auto' = 'auto';
  const rawFormat = (getString(values.format) ?? 'auto').toLowerCase();
  if (rawFormat === 'webm' || rawFormat === 'mp4') {
    format = rawFormat;
  }

  let width = 1280;
  let height = 720;

  const viewportStr = getString(values.viewport);
  if (viewportStr) {
    const parts = viewportStr.split(/x/i);
    if (parts.length === 2) {
      const parsedW = parseInt(parts[0]!, 10);
      const parsedH = parseInt(parts[1]!, 10);
      if (!isNaN(parsedW) && parsedW > 0) width = parsedW;
      if (!isNaN(parsedH) && parsedH > 0) height = parsedH;
    }
  }

  const widthStr = getString(values.width);
  if (widthStr) {
    const parsedW = parseInt(widthStr, 10);
    if (!isNaN(parsedW) && parsedW > 0) width = parsedW;
  }

  const heightStr = getString(values.height);
  if (heightStr) {
    const parsedH = parseInt(heightStr, 10);
    if (!isNaN(parsedH) && parsedH > 0) height = parsedH;
  }

  const rawDpi = getString(values['device-scale-factor']) ?? getString(values.dpi) ?? '2';
  const parsedDpi = parseFloat(rawDpi);
  const dpi = !isNaN(parsedDpi) && parsedDpi > 0 ? parsedDpi : 2;

  const json = Boolean(values.json);
  const help = Boolean(values.help);
  const headed = Boolean(values.headed);

  let browser: 'chromium' | 'firefox' | 'webkit' = 'chromium';
  const rawBrowser = (getString(values.browser) ?? 'chromium').toLowerCase();
  if (rawBrowser === 'chrome' || rawBrowser === 'chromium') {
    browser = 'chromium';
  } else if (rawBrowser === 'firefox') {
    browser = 'firefox';
  } else if (rawBrowser === 'webkit') {
    browser = 'webkit';
  }

  const extension = format === 'mp4' ? '.mp4' : '.webm';
  const outputPath = path.join(outputDir, `demo${extension}`);

  return {
    prompt,
    outputDir,
    format,
    browser,
    headed,
    width,
    height,
    dpi,
    json,
    help,
    outputPath,
  };
}

const HELP_TEXT = `web-demo-generator: Standalone CLI pipeline for prompt-to-video demo generation

Usage:
  web-demo-generator [options] [prompt]

Options:
  -p, --prompt <text>               Natural language description of UI change
  -o, --output-dir <dir>            Output directory (default: ./output)
  -f, --format <format>             Output video format: webm | mp4 | auto (default: auto)
  -b, --browser <engine>            Browser engine: chromium | firefox | webkit (default: chromium)
      --headed                      Run browser in headed mode for visual debugging (default: headless)
  -v, --viewport <WxH>              Viewport size, e.g. 1280x720 (default: 1280x720)
      --width <pixels>              Viewport width
      --height <pixels>             Viewport height
      --dpi <n>                     Device scale factor for high-DPI capture (default: 2)
      --device-scale-factor <n>     Alias for --dpi
      --json                        Output machine-readable JSON to stdout
  -h, --help                        Show help
`;

export async function runCli(argv: string[], deps: CliDeps = {}): Promise<number> {
  const writeOut = deps.stdout ?? ((msg: string) => process.stdout.write(msg));
  const writeErr = deps.stderr ?? ((msg: string) => process.stderr.write(msg));

  const options = parseCliArgs(argv);

  if (options.help) {
    writeOut(HELP_TEXT);
    return 0;
  }

  if (!options.prompt || options.prompt.trim() === '') {
    writeErr('Error: Missing required prompt. Provide --prompt <text> or a positional argument.\n');
    return 1;
  }

  if (!options.json) {
    writeErr('Synthesizing high-fidelity demo from prompt...\n');
    writeErr(`Prompt: "${options.prompt}"\n`);
  }

  try {
    const generatorConfig: DemoGeneratorConfig = {
      headless: !options.headed,
      browser: options.browser,
    };

    const generator =
      deps.generator ??
      (deps.createGenerator ? deps.createGenerator(generatorConfig) : new WebDemoGenerator(generatorConfig));

    const result: DemoGenerationResult = await generator.generateDemo({
      changeDescription: options.prompt,
      outputPath: options.outputPath,
      width: options.width,
      height: options.height,
      deviceScaleFactor: options.dpi,
      format: options.format,
      transcode: options.format === 'mp4' ? 'auto' : options.format === 'webm' ? 'off' : 'auto',
    });

    if (options.json) {
      writeOut(JSON.stringify(result, null, 2) + '\n');
    } else {
      writeErr(`Demo completed in ${result.durationMs}ms with ${result.steps.length} steps.\n`);
      writeOut(result.videoPath + '\n');
    }

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) {
      writeOut(
        JSON.stringify(
          {
            videoPath: '',
            durationMs: 0,
            steps: [],
            status: 'failed',
            mimeType: 'video/webm',
            error: message,
          },
          null,
          2
        ) + '\n'
      );
    }
    writeErr(`Error generating demo: ${message}\n`);
    return 1;
  }
}
