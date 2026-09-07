import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DASHBOARD_DATE_TEXT,
  dashboardFixture,
  processViewerFixture,
} from '../src/fixtures/dashboard.js';

describe('dashboardFixture', () => {
  it('has one value per month in every trend series', () => {
    const { trend } = dashboardFixture;
    expect(trend.months).toHaveLength(12);
    expect(trend.cost).toHaveLength(trend.months.length);
    expect(trend.plans).toHaveLength(trend.months.length);
    expect(trend.prevCost).toHaveLength(trend.months.length);
    expect(trend.prevPlans).toHaveLength(trend.months.length);
  });

  it('describes every job with the fields the dashboard renders', () => {
    expect(dashboardFixture.jobs.length).toBeGreaterThan(0);
    for (const job of dashboardFixture.jobs) {
      expect(job.id).toBeTruthy();
      expect(job.planId).toBeTruthy();
      expect(job.title).toBeTruthy();
      expect(job.status).toBe(job.status.toLowerCase());
    }
    // "running" is what animates the row spinner, so at least one row must be running.
    expect(dashboardFixture.jobs.some((job) => job.status === 'running')).toBe(true);
  });

  it('provides four KPIs with a value and a signed delta', () => {
    expect(dashboardFixture.kpis).toHaveLength(4);
    for (const kpi of dashboardFixture.kpis) {
      expect(kpi.label).toBeTruthy();
      expect(kpi.value).toBeTruthy();
      expect(kpi.delta).toMatch(/^[+-]/);
      expect(['up', 'down']).toContain(kpi.direction);
    }
  });

  it('carries labelled month values for pull requests and git activity', () => {
    for (const item of dashboardFixture.pullRequests) {
      expect(item.label).toBeTruthy();
      expect(Number.isFinite(item.value)).toBe(true);
    }
    for (const month of dashboardFixture.activity) {
      expect(month.label).toBeTruthy();
      expect(month.weeks.length).toBeGreaterThan(0);
      expect(month.weeks.every((week) => Number.isFinite(week))).toBe(true);
    }
  });

  it('keeps status counters and the plan-state summary numeric', () => {
    const counters = [
      dashboardFixture.draftCount,
      dashboardFixture.inProgressCount,
      dashboardFixture.reviewCount,
      dashboardFixture.completedCount,
      dashboardFixture.failedCount,
    ];
    expect(counters).toEqual([8, 5, 3, 142, 2]);
  });

  it('uses a constant date so recordings are byte-comparable across runs', () => {
    expect(dashboardFixture.dateText).toBe(DASHBOARD_DATE_TEXT);
    expect(dashboardFixture.dateText).toBe('Saturday, September 5, 2026');

    // A clock-derived date would make every recording differ; assert the source never reads one.
    const source = fs.readFileSync(
      path.resolve(import.meta.dirname, '..', 'src', 'fixtures', 'dashboard.ts'),
      'utf8'
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('new Date(');
    expect(code).not.toContain('Date.now(');
  });
});

describe('processViewerFixture', () => {
  it('populates every pipeline stage counter', () => {
    expect(processViewerFixture.id).toBeTruthy();
    for (const [key, value] of Object.entries(processViewerFixture)) {
      if (key.endsWith('Count')) {
        expect(Number.isInteger(value)).toBe(true);
      }
    }
    expect(processViewerFixture.executingPlansCount).toBeGreaterThan(0);
  });
});
