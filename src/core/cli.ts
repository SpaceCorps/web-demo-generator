import { parseArgs } from 'node:util';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { WebDemoGenerator } from '../index.js';
import type { DemoGeneratorConfig, DemoGenerationResult } from '../types.js';

export interface CliOptions {
  prompt?: string;
  promptFile?: string;
  outputDir: string;
  format: 'webm' | 'mp4' | 'auto';
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
  stdin?: NodeJS.ReadableStream | (() => Promise<string>);
  isTTY?: boolean | (() => boolean);
  readFile?: (path: string, encoding: BufferEncoding) => Promise<string>;
}

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

export function parseCliArgs(argv: string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      prompt: { type: 'string', short: 'p' },
      'prompt-file': { type: 'string' },
      'output-dir': { type: 'string', short: 'o', default: './output' },
      format: { type: 'string', short: 'f', default: 'auto' },
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

  const promptFile = getString(values['prompt-file']);
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

  const extension = format === 'mp4' ? '.mp4' : '.webm';
  const outputPath = path.join(outputDir, `demo${extension}`);

  return {
    prompt,
    promptFile,
    outputDir,
    format,
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
  cat prompt.txt | web-demo-generator [options]

Options:
  -p, --prompt <text>               Natural language description of UI change (or - for stdin)
      --prompt-file <path>          Load prompt from file (or - for stdin)
  -o, --output-dir <dir>            Output directory (default: ./output)
  -f, --format <format>             Output video format: webm | mp4 | auto (default: auto)
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

  let resolvedPrompt: string | undefined;

  if (options.prompt && options.prompt.trim() !== '' && options.prompt !== '-') {
    resolvedPrompt = options.prompt;
  } else if (options.promptFile && options.promptFile !== '-') {
    const filePath = path.resolve(options.promptFile);
    const readFileFn = deps.readFile ?? ((p: string, enc: BufferEncoding) => fs.readFile(p, enc));
    try {
      resolvedPrompt = await readFileFn(filePath, 'utf-8');
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      writeErr(`Error: Failed to read prompt file "${options.promptFile}": ${reason}\n`);
      return 1;
    }
  } else {
    const isTTY = typeof deps.isTTY === 'function'
      ? deps.isTTY()
      : (deps.isTTY !== undefined ? deps.isTTY : (process.stdin ? (process.stdin.isTTY ?? true) : true));
    const isPiped = isTTY === false || deps.stdin !== undefined;
    const stdinRequested = options.prompt === '-' || options.promptFile === '-';

    if (stdinRequested || (!options.prompt && !options.promptFile && isPiped)) {
      try {
        if (typeof deps.stdin === 'function') {
          resolvedPrompt = await deps.stdin();
        } else {
          const stream = deps.stdin ?? process.stdin;
          resolvedPrompt = await readStream(stream);
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        writeErr(`Error: Failed to read stdin: ${reason}\n`);
        return 1;
      }
    }
  }

  const finalPrompt = resolvedPrompt?.trim();

  if (!finalPrompt) {
    writeErr('Error: Missing required prompt. Provide --prompt <text>, --prompt-file <path>, or pipe via stdin.\n');
    return 1;
  }

  if (!options.json) {
    writeErr('Synthesizing high-fidelity demo from prompt...\n');
    writeErr(`Prompt: "${finalPrompt}"\n`);
  }

  try {
    const generator =
      deps.generator ??
      (deps.createGenerator ? deps.createGenerator() : new WebDemoGenerator());

    const result: DemoGenerationResult = await generator.generateDemo({
      changeDescription: finalPrompt,
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
