import type { PageAnalysis, PageElement } from '../types/index.js';

/**
 * Produces a compact, LLM-friendly textual summary of a PageAnalysis.
 *
 * The full HTML is generally too large and noisy to send directly to a model,
 * so this summary highlights the structural elements that matter for testing.
 */
export function summarizePageForPrompt(analysis: PageAnalysis): string {
  const sections: string[] = [];

  sections.push(`URL: ${analysis.url}`);
  sections.push(`Title: ${analysis.title || '(no title)'}`);
  if (analysis.description) {
    sections.push(`Description: ${analysis.description}`);
  }
  sections.push(`Raw HTML length: ${analysis.rawHtmlLength} chars`);

  if (analysis.landmarks.length > 0) {
    sections.push(`Landmarks: ${analysis.landmarks.join(', ')}`);
  }

  if (analysis.headings.length > 0) {
    sections.push(`Headings:\n${analysis.headings.map((h) => `  - ${h}`).join('\n')}`);
  }

  if (analysis.forms.length > 0) {
    const formLines = analysis.forms.map((form, i) => {
      const fieldLines = form.fields.map((f) => `      - ${describeElement(f)}`).join('\n');
      return [
        `  Form #${i + 1}`,
        `    selector: ${form.selector}`,
        `    method: ${form.method ?? 'get'}`,
        form.action ? `    action: ${form.action}` : null,
        form.submitSelector ? `    submit: ${form.submitSelector}` : null,
        fieldLines.length > 0 ? `    fields:\n${fieldLines}` : '    fields: (none)',
      ]
        .filter((line) => line !== null)
        .join('\n');
    });
    sections.push(`Forms:\n${formLines.join('\n')}`);
  }

  if (analysis.buttons.length > 0) {
    const lines = analysis.buttons.map((b) => `  - ${describeElement(b)}`);
    sections.push(`Buttons:\n${lines.join('\n')}`);
  }

  if (analysis.inputs.length > 0) {
    const lines = analysis.inputs.map((i) => `  - ${describeElement(i)}`);
    sections.push(`Inputs:\n${lines.join('\n')}`);
  }

  if (analysis.links.length > 0) {
    const lines = analysis.links
      .slice(0, 25)
      .map((l) => `  - "${l.text}" -> ${l.href} (${l.selector})`);
    sections.push(`Links (top 25):\n${lines.join('\n')}`);
  }

  return sections.join('\n\n');
}

function describeElement(el: PageElement): string {
  const parts: string[] = [el.tag];
  if (el.type) {
    parts.push(`type=${el.type}`);
  }
  if (el.role) {
    parts.push(`role=${el.role}`);
  }
  if (el.name) {
    parts.push(`name="${el.name}"`);
  }
  if (el.text) {
    parts.push(`text="${el.text}"`);
  }
  if (el.placeholder) {
    parts.push(`placeholder="${el.placeholder}"`);
  }
  if (el.ariaLabel) {
    parts.push(`aria-label="${el.ariaLabel}"`);
  }
  if (el.testId) {
    parts.push(`testid="${el.testId}"`);
  }
  parts.push(`locator=${el.preferredLocator ?? el.selector}`);
  return parts.join(' ');
}
