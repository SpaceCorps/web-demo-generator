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
   * Builds the prompt instructing Claude to generate a high-fidelity animated mimic page.
   */
  buildPrompt(options: DemoPromptOptions): string {
    return `You are an expert web frontend engineer and UI animator.
A developer wants to create a clean, eye-catching, production-quality video recording showing a UI change for release patchnotes.

Change Description:
"${options.changeDescription}"

${options.targetUrl ? `Target URL / Reference: ${options.targetUrl}` : ''}
${options.componentContext ? `Component Context:\n${options.componentContext}` : ''}

Requirements for High-Fidelity Synthetic Page:

1. Asset Injection in <head>:
- Include Tailwind CSS CDN: <script src="https://cdn.tailwindcss.com"></script>
- Include Lucide Icons CDN: <script src="https://unpkg.com/lucide@latest"></script>
- Include Google Fonts font stack (Inter / Geist):
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  Configure Tailwind or CSS body font to use Inter or Geist with antialiasing.

2. Realistic Application Chrome:
- Mandate realistic UI chrome surrounding the demonstrated feature.
- Include a sleek collapsible or fixed sidebar with navigation links, icons, and a user avatar with status badge.
- Include a top navigation header with breadcrumbs, search input, and colored status tags/badges (e.g. green 'Live', blue 'Staging').
- Use modern card layouts with backdrop blur (backdrop-blur-md), soft shadows, and clean borders (border-slate-200 dark:border-slate-800).

3. Animated Synthetic Cursor:
- Inject a floating SVG cursor element (#demo-cursor) styled with:
  pointer-events: none; z-index: 99999; position: fixed;
- The cursor should look like a modern macOS / sleek pointer arrow with a subtle drop shadow.

4. Interactive Tour Timeline:
Implement an automated JavaScript sequence with the following timeline:
- Step 1 (500ms): Idle pause to establish the initial application state.
- Step 2: Cursor movement with smooth cubic-bezier(0.25, 1, 0.5, 1) translation towards target interactive elements.
- Step 3: Hover states on target buttons or cards (trigger CSS hover classes and cursor pulse).
- Step 4: Click ripples (render expanding visual ripple animation and active state styling upon clicking).
- Step 5: Typing cadence (when typing into inputs, simulate human typing with character-by-character timing: 60-90ms delay with slight jitter).
- Step 6: State progression (mutate DOM: open slide-over drawer, reveal modal dialog, update data table row, or transition status badge).
- Step 7: Hold and completion: hold final state for 1.5s, then signal completion by setting:
  window.__DEMO_COMPLETE__ = true;
  and dispatching the custom event:
  window.dispatchEvent(new CustomEvent('demo-complete'));

5. Output Format:
Output ONLY valid JSON with no conversational prefix or markdown fences, using this structure:
{
  "html": "<!DOCTYPE html><html>...</html>",
  "steps": [
    "Step 1: Initial state rendered",
    "Step 2: Cursor navigates to deploy button",
    "Step 3: Modal confirmation and status badge update"
  ],
  "suggestedDurationMs": 6200
}`;
  }

  /**
   * Prompts Claude to synthesize an animated HTML page that demonstrates
   * the requested UI change for patchnotes or showcase videos.
   */
  async generateMimicPage(options: DemoPromptOptions): Promise<MimicPageResult> {
    const prompt = this.buildPrompt(options);

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
