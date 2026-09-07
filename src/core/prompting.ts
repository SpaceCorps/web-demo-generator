import Anthropic from '@anthropic-ai/sdk';
import type { DemoPromptOptions, MimicPageResult } from '../types.js';

export class PromptingEngine {
  private client: Anthropic;
  private model: string;

  constructor(apiKey?: string, model = 'claude-3-7-sonnet-20250219') {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
    this.model = model;
  }

  /**
   * Prompts Claude to synthesize an animated HTML page that demonstrates
   * the requested UI change for patchnotes or showcase videos.
   */
  async generateMimicPage(options: DemoPromptOptions): Promise<MimicPageResult> {
    const prompt = `You are an expert web frontend engineer and UI animator.
A developer wants to create a clean, eye-catching video recording showing a UI change for release patchnotes.

Change Description:
"${options.changeDescription}"

${options.targetUrl ? `Target URL / Reference: ${options.targetUrl}` : ''}
${options.componentContext ? `Component Context:\n${options.componentContext}` : ''}

Task:
1. Build a complete, self-contained HTML page (HTML + CSS + JavaScript in a single file) that mimics the UI.
2. Animate the requested change clearly and smoothly (e.g. state transition, button interaction, layout shift, or feature demonstration).
3. The page should run a seamless demonstration loop or triggered animation timeline.
4. Output ONLY valid JSON with the following structure:
{
  "html": "<!DOCTYPE html><html>...</html>",
  "steps": ["Step 1: Initial state rendered", "Step 2: Hover/click action", "Step 3: New UI revealed"],
  "suggestedDurationMs": 5000
}`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const contentBlock = response.content[0];
    if (!contentBlock || contentBlock.type !== 'text') {
      throw new Error('Unexpected response format from Claude');
    }

    // Extract JSON from response text
    const text = contentBlock.text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse structured JSON from Claude response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as MimicPageResult;
    return parsed;
  }
}
