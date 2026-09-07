import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ComponentType } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { TEMPLATES, resolveTemplateModule, templateIds } from '../src/templates/index.js';
import { componentsAvailable } from '../src/core/harness.js';
import { dashboardFixture } from '../src/fixtures/dashboard.js';

const templatesDir = path.resolve(import.meta.dirname, '..', 'src', 'templates');

describe('template registry', () => {
  it('rejects an unknown template id and lists the valid ones', () => {
    expect(() => resolveTemplateModule('tendril/Nope')).toThrow(
      `Unknown template "tendril/Nope". Registered templates: ${templateIds().join(', ')}`
    );
  });

  it('maps every registered id to a module that exists', () => {
    expect(templateIds().length).toBeGreaterThan(0);
    for (const id of templateIds()) {
      const file = path.join(templatesDir, resolveTemplateModule(id));
      expect(fs.existsSync(file), `${id} -> ${file}`).toBe(true);
    }
  });

  it('registers the Tendril dashboard demo', () => {
    expect(TEMPLATES['tendril/TendrilDashboardDemo']).toBe('tendril/TendrilDashboardDemo.tsx');
  });
});

describe.skipIf(!componentsAvailable())('TendrilDashboardDemo', () => {
  let Demo: ComponentType<Record<string, unknown>>;

  beforeAll(async () => {
    // Imported dynamically: without a components-storybook checkout the module cannot resolve, and
    // a skipped suite must not break collection.
    const module = await import('../src/templates/tendril/TendrilDashboardDemo.js');
    Demo = module.default as ComponentType<Record<string, unknown>>;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the real dashboard with its trend tabs', () => {
    render(<Demo />);

    expect(screen.getByRole('button', { name: 'Total Cost' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Total Plans' })).toBeDefined();
  });

  it('renders the four KPI labels from the fixture', () => {
    render(<Demo />);

    for (const kpi of dashboardFixture.kpis) {
      expect(screen.getByText(kpi.label)).toBeDefined();
    }
  });

  it('renders the fixture job titles', () => {
    render(<Demo />);

    for (const job of dashboardFixture.jobs) {
      expect(screen.getByText(job.title)).toBeDefined();
    }
  });

  it('fills the tunnel slot so the Git Activity / Pull Requests tabs exist', () => {
    render(<Demo />);

    expect(screen.getByRole('button', { name: 'Git Activity' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Pull Requests' })).toBeDefined();
  });

  it('accepts prop overrides on top of the fixture', () => {
    render(<Demo headline="Overridden Headline" />);

    expect(screen.getByText('Overridden Headline')).toBeDefined();
    expect(screen.getByText(dashboardFixture.greeting)).toBeDefined();
  });
});
