/**
 * Mock data for the Tendril dashboard demo template.
 *
 * The DTO shapes mirror TendrilDashboardProps from @spacecorps/components-storybook. They are
 * declared here rather than imported because the components package is resolved through a Vite
 * alias at harness startup, not installed into node_modules — so its types are not visible to
 * `tsc`. Keep these in sync with the component if its props change.
 */

export interface DashboardKpi {
  label: string;
  value: string;
  delta?: string | null;
  direction?: 'up' | 'down' | null;
}

export interface DashboardMonthValue {
  label: string;
  value: number;
}

export interface DashboardActivityMonth {
  label: string;
  weeks: number[];
}

export interface DashboardJob {
  id: string;
  planId: string;
  title: string;
  /** Lowercased job status; "running" animates the row's spinner. */
  status: string;
}

export interface DashboardTrend {
  months: string[];
  cost: number[];
  plans: number[];
  prevCost: (number | null)[];
  prevPlans: (number | null)[];
}

export interface DashboardFixture {
  id: string;
  events: string[];
  dateText: string;
  greeting: string;
  headline: string;
  draftCount: number;
  inProgressCount: number;
  reviewCount: number;
  completedCount: number;
  failedCount: number;
  kpis: DashboardKpi[];
  trend: DashboardTrend;
  pullRequests: DashboardMonthValue[];
  activity: DashboardActivityMonth[];
  jobs: DashboardJob[];
}

export const dashboardKpis: DashboardKpi[] = [
  { label: 'Total Velocity', value: '42 plans/mo', delta: '+18%', direction: 'up' },
  { label: 'Average Cost / Plan', value: '$4.12', delta: '-12%', direction: 'down' },
  { label: 'Merge Rate', value: '96.4%', delta: '+2.1%', direction: 'up' },
  { label: 'Autonomous Success', value: '91.8%', delta: '+5.4%', direction: 'up' },
];

export const dashboardTrend: DashboardTrend = {
  months: ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
  cost: [120, 150, 180, 220, 280, 310, 390, 420, 480, 510, 580, 640],
  plans: [14, 18, 22, 28, 35, 38, 44, 48, 52, 58, 62, 70],
  prevCost: [90, 110, 130, 160, 190, 210, 260, 290, 320, 340, 390, 420],
  prevPlans: [10, 12, 15, 19, 22, 25, 30, 33, 36, 40, 42, 46],
};

export const dashboardPullRequests: DashboardMonthValue[] = [
  { label: 'Apr', value: 34 },
  { label: 'May', value: 42 },
  { label: 'Jun', value: 48 },
  { label: 'Jul', value: 55 },
  { label: 'Aug', value: 64 },
  { label: 'Sep', value: 72 },
];

export const dashboardActivity: DashboardActivityMonth[] = [
  { label: 'May', weeks: [8, 12, 10, 14] },
  { label: 'Jun', weeks: [11, 15, 13, 17] },
  { label: 'Jul', weeks: [14, 18, 16, 20] },
  { label: 'Aug', weeks: [16, 22, 19, 24] },
  { label: 'Sep', weeks: [18, 25, 21, 28] },
];

export const dashboardJobs: DashboardJob[] = [
  {
    id: 'job-001',
    planId: '00064',
    title: 'Port Tendril Dashboard Analytics and Web Viewer',
    status: 'running',
  },
  {
    id: 'job-002',
    planId: '00062',
    title: 'Port Tendril Plan Markdown and Diff Inspection Widgets',
    status: 'running',
  },
  {
    id: 'job-003',
    planId: '00055',
    title: 'Configure Foundation React 19 Tailwind Storybook 8',
    status: 'completed',
  },
];

/**
 * `dateText` is a constant, never `new Date()`: a recording made from this fixture has to be
 * byte-comparable across runs.
 */
export const DASHBOARD_DATE_TEXT = 'Saturday, September 5, 2026';

export const dashboardFixture: DashboardFixture = {
  id: 'dashboard-demo',
  events: ['OnDrafts', 'OnJobs', 'OnReview', 'OnJob'],
  dateText: DASHBOARD_DATE_TEXT,
  greeting: 'Good morning, Operator',
  headline: 'Tendril Autonomous Execution Fleet',
  draftCount: 8,
  inProgressCount: 5,
  reviewCount: 3,
  completedCount: 142,
  failedCount: 2,
  kpis: dashboardKpis,
  trend: dashboardTrend,
  pullRequests: dashboardPullRequests,
  activity: dashboardActivity,
  jobs: dashboardJobs,
};

export interface ProcessViewerFixture {
  id: string;
  events: string[];
  draftCount: number;
  reviewCount: number;
  creatingPlansCount: number;
  updatingPlansCount: number;
  executingPlansCount: number;
  retryingPlansCount: number;
  creatingPrCount: number;
}

export const processViewerFixture: ProcessViewerFixture = {
  id: 'process-viewer-demo',
  events: [],
  draftCount: 8,
  reviewCount: 3,
  creatingPlansCount: 2,
  updatingPlansCount: 1,
  executingPlansCount: 5,
  retryingPlansCount: 1,
  creatingPrCount: 2,
};
