// @vitest-environment node
// The Anthropic SDK refuses to construct in a browser-like environment, and nothing here needs a DOM.
import { describe, it, expect, vi } from 'vitest';
import { WebDemoGenerator, TENDRIL_DASHBOARD_SCRIPT } from '../src/index.js';
import { BrowserRecorder } from '../src/core/recorder.js';
import { ComponentHarness } from '../src/core/harness.js';

describe('WebDemoGenerator', () => {
  it('instantiates correctly with default settings', () => {
    const generator = new WebDemoGenerator();
    expect(generator).toBeDefined();
  });

  it('exposes a scripted dashboard tour that only clicks clickable elements', () => {
    expect(TENDRIL_DASHBOARD_SCRIPT.length).toBeGreaterThan(0);

    const clicks = TENDRIL_DASHBOARD_SCRIPT.filter((step) => step.kind === 'click');
    expect(clicks.length).toBeGreaterThan(0);
    // KPI cards are plain <div>s with no handler, so they are only hovered/scrolled to.
    for (const step of clicks) {
      expect(step.selector).not.toContain('tdb-kpi');
    }
  });

  it('generateComponentDemo stops the harness when recording throws', async () => {
    const startSpy = vi
      .spyOn(ComponentHarness.prototype, 'start')
      .mockResolvedValue({ url: 'http://127.0.0.1:65535/' });
    const stopSpy = vi.spyOn(ComponentHarness.prototype, 'stop').mockResolvedValue();
    const recordUrl = vi
      .spyOn(BrowserRecorder.prototype, 'recordUrl')
      .mockRejectedValue(new Error('recording blew up'));

    const generator = new WebDemoGenerator();
    await expect(
      generator.generateComponentDemo({ template: 'tendril/TendrilDashboardDemo' })
    ).rejects.toThrow('recording blew up');

    expect(startSpy).toHaveBeenCalledOnce();
    expect(stopSpy).toHaveBeenCalledOnce();

    recordUrl.mockRestore();
    startSpy.mockRestore();
    stopSpy.mockRestore();
  });

  it('generateComponentDemo records the harness URL with the dashboard script by default', async () => {
    const startSpy = vi
      .spyOn(ComponentHarness.prototype, 'start')
      .mockResolvedValue({ url: 'http://127.0.0.1:65535/' });
    const stopSpy = vi.spyOn(ComponentHarness.prototype, 'stop').mockResolvedValue();
    const recordUrl = vi
      .spyOn(BrowserRecorder.prototype, 'recordUrl')
      .mockResolvedValue('/tmp/out/component-demo.mp4');

    const generator = new WebDemoGenerator();
    const result = await generator.generateComponentDemo({
      template: 'tendril/TendrilDashboardDemo',
    });

    expect(result.videoPath).toBe('/tmp/out/component-demo.mp4');
    const [url, options] = recordUrl.mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:65535/');
    expect(options.interactions).toEqual(TENDRIL_DASHBOARD_SCRIPT);
    expect(stopSpy).toHaveBeenCalledOnce();

    recordUrl.mockRestore();
    startSpy.mockRestore();
    stopSpy.mockRestore();
  });

  it('generateDemo coordinates prompting and recording returning structured result', async () => {
    const generator = new WebDemoGenerator();
    vi.spyOn((generator as any).prompting, 'generateMimicPage').mockResolvedValue({
      html: '<html><body>Mock demo</body></html>',
      steps: ['Step 1: Init', 'Step 2: Action'],
      suggestedDurationMs: 4000,
    });
    vi.spyOn((generator as any).recorder, 'recordHtml').mockResolvedValue('/tmp/output/demo.webm');

    const result = await generator.generateDemo({
      changeDescription: 'Add user avatar',
      width: 1920,
      height: 1080,
      deviceScaleFactor: 2,
    });

    expect(result).toEqual({
      videoPath: '/tmp/output/demo.webm',
      steps: ['Step 1: Init', 'Step 2: Action'],
      durationMs: 4000,
      status: 'completed',
      mimeType: 'video/webm',
    });
  });
});

