import { defineConfig } from 'vitest/config';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * The components package is private and unpublished, so tests resolve it from a checkout on disk —
 * the same trick the harness uses at runtime. When no checkout is present the alias is omitted and
 * the tests that need real components skip themselves.
 */
const componentsRoot = path.resolve(
  process.env.COMPONENTS_STORYBOOK_PATH ??
    path.resolve(import.meta.dirname, '..', 'components-storybook')
);
const hasComponents = fs.existsSync(path.join(componentsRoot, 'dist', 'tendril.mjs'));

export default defineConfig({
  resolve: {
    alias: hasComponents
      ? {
          '@spacecorps/components-storybook/tendril': path.join(
            componentsRoot,
            'dist',
            'tendril.mjs'
          ),
          '@spacecorps/components-storybook/style.css': path.join(
            componentsRoot,
            'dist',
            'style.css'
          ),
          '@spacecorps/components-storybook': path.join(componentsRoot, 'dist', 'index.mjs'),
        }
      : {},
    // The component bundle ships next to its own React copy; two copies in one tree break hooks.
    dedupe: ['react', 'react-dom'],
  },
  esbuild: {
    jsx: 'automatic',
  },
  server: {
    fs: {
      // The component bundle and its own dependencies live outside this project.
      allow: [import.meta.dirname, componentsRoot],
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    testTimeout: 30_000,
  },
});
