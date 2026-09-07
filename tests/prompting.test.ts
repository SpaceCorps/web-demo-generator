// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { PromptingEngine } from '../src/core/prompting.js';

describe('PromptingEngine prompt scaffold', () => {
  it('includes Tailwind CDN, Lucide CDN, and Google Fonts in asset requirements', () => {
    const engine = new PromptingEngine('mock-api-key');
    const prompt = engine.buildPrompt({
      changeDescription: 'Show active filters in table header',
    });

    expect(prompt).toContain('https://cdn.tailwindcss.com');
    expect(prompt).toContain('https://unpkg.com/lucide@latest');
    expect(prompt).toContain('fonts.googleapis.com');
    expect(prompt).toContain('Inter');
  });

  it('mandates realistic application chrome with sidebar and header', () => {
    const engine = new PromptingEngine('mock-api-key');
    const prompt = engine.buildPrompt({
      changeDescription: 'Add user settings modal',
    });

    expect(prompt).toContain('sidebar');
    expect(prompt).toContain('breadcrumbs');
    expect(prompt).toContain('backdrop-blur-md');
    expect(prompt).toContain('border-slate-200');
  });

  it('specifies animated synthetic cursor injection (#demo-cursor)', () => {
    const engine = new PromptingEngine('mock-api-key');
    const prompt = engine.buildPrompt({
      changeDescription: 'Click confirmation dialog button',
    });

    expect(prompt).toContain('#demo-cursor');
    expect(prompt).toContain('pointer-events: none');
    expect(prompt).toContain('z-index: 99999');
    expect(prompt).toContain('position: fixed');
  });

  it('mandates interactive tour timeline and the __DEMO_COMPLETE__ signal contract', () => {
    const engine = new PromptingEngine('mock-api-key');
    const prompt = engine.buildPrompt({
      changeDescription: 'Demonstrate animated chart zoom',
    });

    expect(prompt).toContain('cubic-bezier(0.25, 1, 0.5, 1)');
    expect(prompt).toContain('ripple');
    expect(prompt).toContain('window.__DEMO_COMPLETE__ = true');
    expect(prompt).toContain("demo-complete");
  });
});
