import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolveTemplateModule } from '../templates/index.js';

export interface HarnessOptions {
  /** Template module id, e.g. 'tendril/TendrilDashboardDemo'. */
  template: string;
  /** Props/fixture overrides serialised into the entry module. */
  props?: Record<string, unknown>;
  theme?: 'light' | 'dark';
  density?: 'small' | 'medium' | 'large';
  /** Absolute path to the components-storybook checkout. */
  componentsPath?: string;
  port?: number;
}

/** Package root, two levels up from this module in both `src/core` and `dist/core`. */
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Templates ship as source: Vite transforms them at harness startup, `tsc` never sees them. */
const templatesDir = path.join(packageRoot, 'src', 'templates');

const require_ = createRequire(path.join(packageRoot, 'package.json'));

const DENSITY_NAMES = { small: 'Small', medium: 'Medium', large: 'Large' } as const;

/**
 * Locates the components-storybook checkout whose built output the harness renders.
 *
 * Order: explicit argument, then `COMPONENTS_STORYBOOK_PATH`, then the sibling checkout. The
 * package is private and unpublished, so it is resolved from disk through a Vite alias rather than
 * installed into `node_modules` — see the harness section of the README.
 *
 * @throws when the checkout has no built `dist/tendril.mjs` + `dist/style.css`.
 */
export function resolveComponentsPath(componentsPath?: string): string {
  const candidate = path.resolve(
    componentsPath ??
      process.env.COMPONENTS_STORYBOOK_PATH ??
      path.resolve(packageRoot, '..', 'components-storybook')
  );

  for (const relative of ['dist/tendril.mjs', 'dist/style.css']) {
    const file = path.join(candidate, relative);
    if (!fs.existsSync(file)) {
      throw new Error(
        `components-storybook build output not found: "${file}" is missing. ` +
          `Point COMPONENTS_STORYBOOK_PATH at a checkout of @spacecorps/components-storybook ` +
          `and build it there with \`pnpm build\`.`
      );
    }
  }

  return candidate;
}

/** True when a components-storybook build is available; used to gate integration tests. */
export function componentsAvailable(componentsPath?: string): boolean {
  try {
    resolveComponentsPath(componentsPath);
    return true;
  } catch {
    return false;
  }
}

/** Resolves a CSS asset from this package's own dependencies, or `null` when it is not installed. */
function tryResolveCss(specifier: string): string | null {
  try {
    return require_.resolve(specifier);
  } catch {
    return null;
  }
}

/**
 * Serves a single template as a real page, rendering authentic components with their own
 * stylesheet and theme tokens. Backed by a Vite dev server on loopback; nothing is written into
 * the repository — the generated entry lives in a temp directory that `stop()` removes.
 */
export class ComponentHarness {
  private server: { close: () => Promise<void> } | null = null;
  private tempDir: string | null = null;

  async start(options: HarnessOptions): Promise<{ url: string }> {
    if (this.server) {
      throw new Error('Harness is already running. Call stop() before starting it again.');
    }

    const componentsRoot = resolveComponentsPath(options.componentsPath);
    const templateFile = path.join(templatesDir, resolveTemplateModule(options.template));
    if (!fs.existsSync(templateFile)) {
      throw new Error(
        `Template "${options.template}" is registered but its module is missing: ${templateFile}`
      );
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-demo-harness-'));
    this.tempDir = tempDir;

    fs.writeFileSync(path.join(tempDir, 'index.html'), indexHtml(), 'utf8');
    fs.writeFileSync(path.join(tempDir, 'main.tsx'), entryModule(options), 'utf8');

    // Imported lazily so `vite` stays a devDependency: only the harness needs it.
    const { createServer } = await import('vite');
    const react = (await import('@vitejs/plugin-react')).default;

    const server = await createServer({
      configFile: false,
      root: tempDir,
      logLevel: 'warn',
      plugins: [react()],
      resolve: {
        alias: [
          {
            find: '@harness/template',
            replacement: templateFile,
          },
          {
            find: '@spacecorps/components-storybook/tendril',
            replacement: path.join(componentsRoot, 'dist', 'tendril.mjs'),
          },
          {
            find: '@spacecorps/components-storybook/style.css',
            replacement: path.join(componentsRoot, 'dist', 'style.css'),
          },
          {
            // Anchored so it cannot swallow the subpath entries above.
            find: /^@spacecorps\/components-storybook$/,
            replacement: path.join(componentsRoot, 'dist', 'index.mjs'),
          },
          ...reactAliases(),
          ...fontAliases(),
        ],
      },
      server: {
        host: '127.0.0.1',
        port: options.port ?? 0,
        fs: {
          // The template, its fixtures and the component bundle all live outside `root`.
          allow: [tempDir, packageRoot, componentsRoot],
        },
      },
    });

    await server.listen();
    this.server = server;

    const url = server.resolvedUrls?.local?.[0];
    if (!url) {
      await this.stop();
      throw new Error('Harness failed to start: Vite reported no local URL');
    }

    return { url };
  }

  /** Closes the server and removes the generated entry. Safe to call more than once. */
  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (server) {
      await server.close();
    }

    const tempDir = this.tempDir;
    this.tempDir = null;
    if (tempDir) {
      await removeTempDir(tempDir);
    }
  }
}

/**
 * Removes the generated entry directory, and keeps removing it until it stays gone.
 *
 * Vite's dependency optimizer commits its cache *after* `server.close()` has resolved — measured at
 * roughly 50 ms — so a single `rmSync` deletes the directory and then watches the optimizer recreate
 * it as `.vite/deps_temp_<hash>/`. Sweeping until two consecutive checks come back clean leaves
 * nothing behind in the OS temp directory.
 */
async function removeTempDir(dir: string, intervalMs = 100, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let cleanChecks = 0;

  while (cleanChecks < 2 && Date.now() < deadline) {
    fs.rmSync(dir, { recursive: true, force: true });
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    cleanChecks = fs.existsSync(dir) ? 0 : cleanChecks + 1;
  }

  // Whatever the optimizer is still holding, this is the last word on the directory.
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Pins React onto this package's own copy.
 *
 * The generated entry lives in a temp directory with no `node_modules`, and the component bundle
 * would otherwise resolve React from its own checkout — two copies in one page break hooks. The
 * patterns are anchored regexes: a plain string alias for `react` would also swallow
 * `react/jsx-runtime` and rewrite it to `.../react/index.js/jsx-runtime`.
 */
function reactAliases(): { find: RegExp; replacement: string }[] {
  return ['react', 'react-dom'].flatMap((name) => {
    const dir = path.dirname(require_.resolve(`${name}/package.json`));
    return [
      { find: new RegExp(`^${name}$`), replacement: dir },
      { find: new RegExp(`^${name}/(.*)$`), replacement: `${dir}/$1` },
    ];
  });
}

/** Variable font aliases; skipped when the font packages are not installed. */
function fontAliases(): { find: string; replacement: string }[] {
  const fonts = ['@fontsource-variable/geist', '@fontsource-variable/geist-mono'];
  return fonts.flatMap((font) => {
    const resolved = tryResolveCss(`${font}/index.css`);
    return resolved ? [{ find: `${font}/index.css`, replacement: resolved }] : [];
  });
}

function indexHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Component Harness</title>
    <style>
      html,
      body,
      #root {
        margin: 0;
        padding: 0;
        min-height: 100%;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
`;
}

/**
 * Generated entry. Mirrors the Storybook preview decorator — `data-density`, the `dark` class and
 * `DensityProvider` — minus its `p-6` padding, because a recording wants the component
 * edge-to-edge.
 */
function entryModule(options: HarnessOptions): string {
  const density = DENSITY_NAMES[options.density ?? 'medium'];
  const isDark = options.theme === 'dark';
  const fontImports = fontAliases()
    .map((alias) => `import ${JSON.stringify(alias.find)};`)
    .join('\n');

  return `${fontImports}
import '@spacecorps/components-storybook/style.css';
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { DensityProvider, Densities } from '@spacecorps/components-storybook';
import Template from '@harness/template';

const props = ${JSON.stringify(options.props ?? {}, null, 2)};

/** Signals the recorder once the tree has actually painted. */
function ReadySignal({ children }) {
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.__HARNESS_READY__ = true;
      });
    });
  }, []);
  return children;
}

const container = document.getElementById('root');
createRoot(container).render(
  <div
    data-density=${JSON.stringify(density.toLowerCase())}
    className=${JSON.stringify(
      isDark ? 'dark bg-background text-foreground' : 'bg-background text-foreground'
    )}
    style={{ minHeight: '100vh' }}
  >
    <DensityProvider density={Densities.${density}}>
      <ReadySignal>
        <Template {...props} />
      </ReadySignal>
    </DensityProvider>
  </div>
);
`;
}
