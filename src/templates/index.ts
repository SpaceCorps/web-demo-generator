/**
 * Registry of harness templates.
 *
 * Values are paths relative to this directory. They are plain strings rather than static imports on
 * purpose: the template modules are `.tsx` files compiled by Vite at harness startup, so importing
 * them from library code would drag JSX and the aliased component package into the `tsc` build.
 *
 * The registry exists so an unknown template id fails with a list of valid ids instead of a Vite 404.
 */
export const TEMPLATES: Record<string, string> = {
  'tendril/TendrilDashboardDemo': 'tendril/TendrilDashboardDemo.tsx',
};

export type TemplateId = keyof typeof TEMPLATES;

/** Ids of every registered template, sorted for stable error messages. */
export function templateIds(): string[] {
  return Object.keys(TEMPLATES).sort();
}

/**
 * Returns the module path (relative to `src/templates`) for a template id.
 * @throws if the id is not registered.
 */
export function resolveTemplateModule(id: string): string {
  const relativePath = TEMPLATES[id];
  if (!relativePath) {
    throw new Error(
      `Unknown template "${id}". Registered templates: ${templateIds().join(', ')}`
    );
  }
  return relativePath;
}
