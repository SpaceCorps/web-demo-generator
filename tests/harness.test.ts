// @vitest-environment node
// The integration test talks HTTP to the harness, so it needs Node's own fetch and no DOM shim.
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ComponentHarness,
  componentsAvailable,
  resolveComponentsPath,
} from '../src/core/harness.js';

const originalEnv = process.env.COMPONENTS_STORYBOOK_PATH;
const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
  tempDirs.push(dir);
  return dir;
}

/** A directory that looks like a built components-storybook checkout. */
function makeFakeCheckout(): string {
  const dir = makeTempDir();
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'dist', 'tendril.mjs'), 'export const TendrilDashboard = null;');
  fs.writeFileSync(path.join(dir, 'dist', 'style.css'), ':root { --x: 0; }');
  return dir;
}

beforeEach(() => {
  delete process.env.COMPONENTS_STORYBOOK_PATH;
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env.COMPONENTS_STORYBOOK_PATH;
  else process.env.COMPONENTS_STORYBOOK_PATH = originalEnv;

  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('resolveComponentsPath', () => {
  it('prefers the explicit argument', () => {
    const checkout = makeFakeCheckout();
    expect(resolveComponentsPath(checkout)).toBe(checkout);
  });

  it('honours COMPONENTS_STORYBOOK_PATH', () => {
    const checkout = makeFakeCheckout();
    process.env.COMPONENTS_STORYBOOK_PATH = checkout;
    expect(resolveComponentsPath()).toBe(checkout);
  });

  it('throws a message naming the missing dist file', () => {
    const dir = makeTempDir();
    fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'dist', 'tendril.mjs'), '');

    expect(() => resolveComponentsPath(dir)).toThrow(path.join(dir, 'dist', 'style.css'));
    expect(() => resolveComponentsPath(dir)).toThrow('pnpm build');
  });

  it('reports availability without throwing', () => {
    expect(componentsAvailable(makeFakeCheckout())).toBe(true);
    expect(componentsAvailable(makeTempDir())).toBe(false);
  });
});

describe('ComponentHarness (unit)', () => {
  it('rejects an unknown template before starting a server', async () => {
    const harness = new ComponentHarness();
    await expect(
      harness.start({ template: 'nope/DoesNotExist', componentsPath: makeFakeCheckout() })
    ).rejects.toThrow(/Unknown template "nope\/DoesNotExist"/);
    await harness.stop();
  });

  it('stop() is idempotent on a harness that never started', async () => {
    const harness = new ComponentHarness();
    await harness.stop();
    await expect(harness.stop()).resolves.toBeUndefined();
  });
});

describe.skipIf(!componentsAvailable())('ComponentHarness (integration)', () => {
  let harness: ComponentHarness;

  beforeEach(() => {
    // The outer beforeEach clears the variable; the real checkout is what this suite gates on.
    if (originalEnv !== undefined) process.env.COMPONENTS_STORYBOOK_PATH = originalEnv;
    harness = new ComponentHarness();
  });

  afterEach(async () => {
    await harness.stop();
  });

  it('serves the template on loopback and unbinds the port on stop', async () => {
    const { url } = await harness.start({ template: 'tendril/TendrilDashboardDemo' });

    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);

    const response = await fetch(url);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('<div id="root">');
    expect(html).toContain('/main.tsx');

    await harness.stop();
    await expect(harness.stop()).resolves.toBeUndefined();
    await expect(fetch(url)).rejects.toThrow();
  });

  it('leaves no temp directory behind', async () => {
    const before = new Set(fs.readdirSync(os.tmpdir()).filter(isHarnessTempDir));

    await harness.start({ template: 'tendril/TendrilDashboardDemo' });
    const started = fs.readdirSync(os.tmpdir()).filter((e) => isHarnessTempDir(e) && !before.has(e));
    expect(started).toHaveLength(1);

    await harness.stop();

    // Vite's dep optimizer writes its cache after close() resolves; stop() must outlast that.
    expect(fs.existsSync(path.join(os.tmpdir(), started[0]!))).toBe(false);
  });
});

function isHarnessTempDir(entry: string): boolean {
  return entry.startsWith('web-demo-harness-');
}
