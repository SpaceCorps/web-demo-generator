import { describe, it, expect } from 'vitest';
import { WebDemoGenerator } from '../src/index.js';

describe('WebDemoGenerator', () => {
  it('instantiates correctly with default settings', () => {
    const generator = new WebDemoGenerator();
    expect(generator).toBeDefined();
  });
});
