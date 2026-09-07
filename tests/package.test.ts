import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

describe('package.json files allowlist', () => {
  it('defines a valid files field in package.json', () => {
    const pkgPath = resolve(rootDir, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

    expect(pkg.files).toBeDefined();
    expect(Array.isArray(pkg.files)).toBe(true);
    expect(pkg.files).toContain('dist');
    expect(pkg.files).toContain('src/templates');
    expect(pkg.files).toContain('src/fixtures');
    expect(pkg.files).not.toContain('tests');
    expect(pkg.files).not.toContain('tsconfig.json');
    expect(pkg.files).not.toContain('vitest.config.ts');
  });

  it('excludes tests and development configs from packed tarball', () => {
    // Ensure dist is built so entry point check passes
    execSync('npm run build', { cwd: rootDir, stdio: 'pipe' });

    const stdout = execSync('npm pack --dry-run --json', {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const packResults = JSON.parse(stdout);
    expect(Array.isArray(packResults)).toBe(true);
    expect(packResults.length).toBeGreaterThan(0);

    const packData = packResults[0];
    const filePaths: string[] = packData.files.map((f: { path: string }) => f.path);

    // Validates that the packed tarball includes expected entry points
    expect(filePaths).toContain('dist/index.js');
    expect(filePaths).toContain('README.md');
    expect(filePaths).toContain('package.json');

    // Validates templates and fixtures are included
    expect(filePaths.some((p) => p.startsWith('src/templates/'))).toBe(true);
    expect(filePaths.some((p) => p.startsWith('src/fixtures/'))).toBe(true);

    // Validates that none of the files from tests/ or development configs are present
    expect(filePaths.some((p) => p.startsWith('tests/'))).toBe(false);
    expect(filePaths).not.toContain('tsconfig.json');
    expect(filePaths).not.toContain('vitest.config.ts');
    expect(filePaths.some((p) => p.startsWith('src/core/'))).toBe(false);
    expect(filePaths.some((p) => p.startsWith('src/bin/'))).toBe(false);
  });
});
