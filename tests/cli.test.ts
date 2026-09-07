import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'node:stream';
import { parseCliArgs, runCli } from '../src/core/cli.js';
import type { WebDemoGenerator } from '../src/index.js';

describe('CLI argument parser', () => {
  it('parses --prompt-file flag', () => {
    const opts = parseCliArgs(['--prompt-file', './templates/demo.md']);
    expect(opts.promptFile).toBe('./templates/demo.md');
  });

  it('parses --prompt and short flag -p', () => {
    const opts1 = parseCliArgs(['--prompt', 'Add dark mode toggle']);
    expect(opts1.prompt).toBe('Add dark mode toggle');

    const opts2 = parseCliArgs(['-p', 'Add notification center']);
    expect(opts2.prompt).toBe('Add notification center');
  });

  it('supports positional argument for prompt', () => {
    const opts = parseCliArgs(['Show', 'analytics', 'dashboard', 'graph']);
    expect(opts.prompt).toBe('Show analytics dashboard graph');
  });

  it('parses --output-dir and -o with default', () => {
    const defaultOpts = parseCliArgs(['-p', 'test']);
    expect(defaultOpts.outputDir).toBe('./output');

    const opts1 = parseCliArgs(['-p', 'test', '--output-dir', './artifacts/videos']);
    expect(opts1.outputDir).toBe('./artifacts/videos');

    const opts2 = parseCliArgs(['-p', 'test', '-o', '/tmp/demo']);
    expect(opts2.outputDir).toBe('/tmp/demo');
  });

  it('parses --format and -f (webm, mp4, auto)', () => {
    const defaultOpts = parseCliArgs(['-p', 'test']);
    expect(defaultOpts.format).toBe('auto');

    const optsWebm = parseCliArgs(['-p', 'test', '-f', 'webm']);
    expect(optsWebm.format).toBe('webm');
    expect(optsWebm.outputPath).toContain('.webm');

    const optsMp4 = parseCliArgs(['-p', 'test', '--format', 'mp4']);
    expect(optsMp4.format).toBe('mp4');
    expect(optsMp4.outputPath).toContain('.mp4');
  });

  it('parses --viewport and width/height overrides', () => {
    const defaultOpts = parseCliArgs(['-p', 'test']);
    expect(defaultOpts.width).toBe(1280);
    expect(defaultOpts.height).toBe(720);

    const optsViewport = parseCliArgs(['-p', 'test', '--viewport', '1920x1080']);
    expect(optsViewport.width).toBe(1920);
    expect(optsViewport.height).toBe(1080);

    const optsCustom = parseCliArgs(['-p', 'test', '--width', '1600', '--height', '900']);
    expect(optsCustom.width).toBe(1600);
    expect(optsCustom.height).toBe(900);
  });

  it('parses --dpi and --device-scale-factor', () => {
    const defaultOpts = parseCliArgs(['-p', 'test']);
    expect(defaultOpts.dpi).toBe(2);

    const optsDpi = parseCliArgs(['-p', 'test', '--dpi', '3']);
    expect(optsDpi.dpi).toBe(3);

    const optsScale = parseCliArgs(['-p', 'test', '--device-scale-factor', '1.5']);
    expect(optsScale.dpi).toBe(1.5);
  });

  it('parses --json and --help flags', () => {
    const opts = parseCliArgs(['-p', 'test', '--json', '--help']);
    expect(opts.json).toBe(true);
    expect(opts.help).toBe(true);
  });
});

describe('CLI runner execution', () => {
  it('displays help documentation and exits with code 0 on --help', async () => {
    const stdoutCalls: string[] = [];
    const exitCode = await runCli(['--help'], {
      stdout: (msg) => stdoutCalls.push(msg),
    });

    expect(exitCode).toBe(0);
    expect(stdoutCalls.join('')).toContain('Usage:');
    expect(stdoutCalls.join('')).toContain('--prompt');
  });

  it('returns exit code 1 and writes clear error message to stderr when prompt is missing', async () => {
    const stderrCalls: string[] = [];
    const exitCode = await runCli([], {
      stderr: (msg) => stderrCalls.push(msg),
    });

    expect(exitCode).toBe(1);
    expect(stderrCalls.join('')).toContain('Error: Missing required prompt');
  });

  it('outputs well-formed JSON when --json flag is passed', async () => {
    const stdoutCalls: string[] = [];
    const stderrCalls: string[] = [];

    const mockGenerator = {
      generateDemo: vi.fn().mockResolvedValue({
        videoPath: 'output/demo.webm',
        durationMs: 6200,
        steps: [
          'Step 1: Initial state rendered',
          'Step 2: Cursor navigates to deploy button',
          'Step 3: Modal confirmation and status badge update',
        ],
        status: 'completed',
        mimeType: 'video/webm',
      }),
    } as unknown as WebDemoGenerator;

    const exitCode = await runCli(['-p', 'Deploy button interaction', '--json'], {
      generator: mockGenerator,
      stdout: (msg) => stdoutCalls.push(msg),
      stderr: (msg) => stderrCalls.push(msg),
    });

    expect(exitCode).toBe(0);
    const fullStdout = stdoutCalls.join('');
    const parsed = JSON.parse(fullStdout);

    expect(parsed).toEqual({
      videoPath: 'output/demo.webm',
      durationMs: 6200,
      steps: [
        'Step 1: Initial state rendered',
        'Step 2: Cursor navigates to deploy button',
        'Step 3: Modal confirmation and status badge update',
      ],
      status: 'completed',
      mimeType: 'video/webm',
    });
  });

  it('prints human-readable messages to stderr and final video path to stdout in standard mode', async () => {
    const stdoutCalls: string[] = [];
    const stderrCalls: string[] = [];

    const mockGenerator = {
      generateDemo: vi.fn().mockResolvedValue({
        videoPath: 'output/demo.webm',
        durationMs: 4500,
        steps: ['Step 1', 'Step 2'],
        status: 'completed',
        mimeType: 'video/webm',
      }),
    } as unknown as WebDemoGenerator;

    const exitCode = await runCli(['-p', 'Filter table rows'], {
      generator: mockGenerator,
      stdout: (msg) => stdoutCalls.push(msg),
      stderr: (msg) => stderrCalls.push(msg),
    });

    expect(exitCode).toBe(0);
    expect(stderrCalls.join('')).toContain('Synthesizing high-fidelity demo');
    expect(stdoutCalls.join('').trim()).toBe('output/demo.webm');
  });

  it('handles generator errors gracefully and returns exit code 1', async () => {
    const stdoutCalls: string[] = [];
    const stderrCalls: string[] = [];

    const mockGenerator = {
      generateDemo: vi.fn().mockRejectedValue(new Error('Browser launch failed')),
    } as unknown as WebDemoGenerator;

    const exitCode = await runCli(['-p', 'Fail scenario', '--json'], {
      generator: mockGenerator,
      stdout: (msg) => stdoutCalls.push(msg),
      stderr: (msg) => stderrCalls.push(msg),
    });

    expect(exitCode).toBe(1);
    const parsed = JSON.parse(stdoutCalls.join(''));
    expect(parsed.status).toBe('failed');
    expect(parsed.error).toContain('Browser launch failed');
  });

  it('successfully loads prompt from file via injected readFile and passes to generator.generateDemo', async () => {
    const stdoutCalls: string[] = [];
    const mockGenerator = {
      generateDemo: vi.fn().mockResolvedValue({
        videoPath: 'output/demo.webm',
        durationMs: 3000,
        steps: ['Step 1'],
        status: 'completed',
        mimeType: 'video/webm',
      }),
    } as unknown as WebDemoGenerator;

    const mockReadFile = vi.fn().mockResolvedValue('Prompt content from file template');

    const exitCode = await runCli(['--prompt-file', './prompts/demo.md'], {
      generator: mockGenerator,
      readFile: mockReadFile,
      stdout: (msg) => stdoutCalls.push(msg),
      stderr: () => {},
    });

    expect(exitCode).toBe(0);
    expect(mockReadFile).toHaveBeenCalled();
    expect(mockGenerator.generateDemo).toHaveBeenCalledWith(
      expect.objectContaining({
        changeDescription: 'Prompt content from file template',
      })
    );
  });

  it('handles missing prompt file gracefully, printing error and returning exit code 1', async () => {
    const stderrCalls: string[] = [];
    const mockReadFile = vi.fn().mockRejectedValue(new Error('ENOENT: no such file or directory'));

    const exitCode = await runCli(['--prompt-file', './missing.md'], {
      readFile: mockReadFile,
      stderr: (msg) => stderrCalls.push(msg),
    });

    expect(exitCode).toBe(1);
    expect(stderrCalls.join('')).toContain('Error: Failed to read prompt file "./missing.md"');
    expect(stderrCalls.join('')).toContain('ENOENT: no such file or directory');
  });

  it('reads prompt from piped stdin stream when no prompt argument is provided and isTTY is false', async () => {
    const stdoutCalls: string[] = [];
    const mockGenerator = {
      generateDemo: vi.fn().mockResolvedValue({
        videoPath: 'output/demo.webm',
        durationMs: 3000,
        steps: ['Step 1'],
        status: 'completed',
        mimeType: 'video/webm',
      }),
    } as unknown as WebDemoGenerator;

    const stdinStream = Readable.from(['Prompt streamed via stdin']);

    const exitCode = await runCli([], {
      generator: mockGenerator,
      stdin: stdinStream,
      isTTY: false,
      stdout: (msg) => stdoutCalls.push(msg),
      stderr: () => {},
    });

    expect(exitCode).toBe(0);
    expect(mockGenerator.generateDemo).toHaveBeenCalledWith(
      expect.objectContaining({
        changeDescription: 'Prompt streamed via stdin',
      })
    );
  });

  it('reads prompt from stdin when --prompt - or --prompt-file - is passed', async () => {
    const mockGenerator = {
      generateDemo: vi.fn().mockResolvedValue({
        videoPath: 'output/demo.webm',
        durationMs: 3000,
        steps: ['Step 1'],
        status: 'completed',
        mimeType: 'video/webm',
      }),
    } as unknown as WebDemoGenerator;

    const exitCodePrompt = await runCli(['--prompt', '-'], {
      generator: mockGenerator,
      stdin: Readable.from(['Prompt from dash prompt']),
      isTTY: true,
      stdout: () => {},
      stderr: () => {},
    });
    expect(exitCodePrompt).toBe(0);
    expect(mockGenerator.generateDemo).toHaveBeenCalledWith(
      expect.objectContaining({
        changeDescription: 'Prompt from dash prompt',
      })
    );

    const exitCodePromptFile = await runCli(['--prompt-file', '-'], {
      generator: mockGenerator,
      stdin: Readable.from(['Prompt from dash prompt-file']),
      stdout: () => {},
      stderr: () => {},
    });
    expect(exitCodePromptFile).toBe(0);
    expect(mockGenerator.generateDemo).toHaveBeenCalledWith(
      expect.objectContaining({
        changeDescription: 'Prompt from dash prompt-file',
      })
    );
  });

  it('reads prompt from stdin when positional argument is -', async () => {
    const mockGenerator = {
      generateDemo: vi.fn().mockResolvedValue({
        videoPath: 'output/demo.webm',
        durationMs: 3000,
        steps: ['Step 1'],
        status: 'completed',
        mimeType: 'video/webm',
      }),
    } as unknown as WebDemoGenerator;

    const exitCode = await runCli(['-'], {
      generator: mockGenerator,
      stdin: Readable.from(['Prompt from positional dash']),
      stdout: () => {},
      stderr: () => {},
    });

    expect(exitCode).toBe(0);
    expect(mockGenerator.generateDemo).toHaveBeenCalledWith(
      expect.objectContaining({
        changeDescription: 'Prompt from positional dash',
      })
    );
  });

  it('rejects empty stdin with clear error message and exit code 1', async () => {
    const stderrCalls: string[] = [];

    const exitCode = await runCli([], {
      stdin: Readable.from(['   \n  ']),
      isTTY: false,
      stderr: (msg) => stderrCalls.push(msg),
    });

    expect(exitCode).toBe(1);
    expect(stderrCalls.join('')).toContain('Error: Missing required prompt');
  });

  it('confirms --prompt takes precedence when both --prompt and --prompt-file are provided simultaneously', async () => {
    const mockGenerator = {
      generateDemo: vi.fn().mockResolvedValue({
        videoPath: 'output/demo.webm',
        durationMs: 3000,
        steps: ['Step 1'],
        status: 'completed',
        mimeType: 'video/webm',
      }),
    } as unknown as WebDemoGenerator;

    const mockReadFile = vi.fn().mockResolvedValue('Prompt from file');

    const exitCode = await runCli(['--prompt', 'Inline override prompt', '--prompt-file', './file.md'], {
      generator: mockGenerator,
      readFile: mockReadFile,
      stdout: () => {},
      stderr: () => {},
    });

    expect(exitCode).toBe(0);
    expect(mockReadFile).not.toHaveBeenCalled();
    expect(mockGenerator.generateDemo).toHaveBeenCalledWith(
      expect.objectContaining({
        changeDescription: 'Inline override prompt',
      })
    );
  });
});
