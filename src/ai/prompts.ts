import type { PageAnalysis, TestScenario } from '../types/index.js';
import { summarizePageForPrompt } from '../parser/extractor.js';

/**
 * The system prompt establishes the model's role as a senior QA engineer that
 * outputs strictly-typed JSON. We deliberately avoid asking the model to write
 * code in this stage — code generation is handled in the second pass.
 */
export const SCENARIO_SYSTEM_PROMPT = `
You are a senior QA automation engineer with deep expertise in Playwright,
TypeScript, and accessibility-first testing. You design realistic, production-
quality end-to-end test scenarios.

Rules:
- Return ONLY a JSON array of scenario objects, with no surrounding prose,
  no markdown fences, and no commentary.
- Every scenario MUST be runnable from a fresh page load — include a
  navigation step at the start.
- Prefer accessibility-first locators (getByRole, getByLabel, getByTestId,
  getByText) over CSS selectors.
- Steps must describe user-visible actions in plain English (e.g. "Click the
  primary 'Sign in' button"). Do NOT include code in steps.
- Assertions must be observable from the user's perspective (URLs, visible
  text, element state, network responses).
- Avoid fabricating elements that are not in the provided page summary.

Each scenario object must match this TypeScript interface exactly:

interface TestScenario {
  name: string;          // short, sentence-style title
  description: string;   // 1-2 sentences explaining the user goal
  tags?: string[];       // e.g. ["smoke", "regression", "auth"]
  steps: string[];       // ordered, plain-English user actions
  assertions: string[];  // observable expected outcomes
}
`.trim();

export function buildScenarioUserPrompt(
  analysis: PageAnalysis,
  scenarioCount: number,
  hints: string[] = [],
): string {
  const summary = summarizePageForPrompt(analysis);
  const hintBlock =
    hints.length > 0
      ? `\n\nAdditional hints from the user (treat as required focus areas):\n${hints
          .map((h, i) => `${i + 1}. ${h}`)
          .join('\n')}`
      : '';

  return `
Generate ${scenarioCount} high-value Playwright test scenarios for the page below.

Coverage guidance:
- Include at least one happy-path scenario.
- Include at least one negative / validation scenario when forms are present.
- Include at least one navigation or accessibility scenario when applicable.
- Avoid duplicate or near-duplicate scenarios.

Page summary:
\`\`\`
${summary}
\`\`\`${hintBlock}

Respond with a JSON array of TestScenario objects only.
`.trim();
}

/**
 * The code-generation prompt asks the model to convert validated scenarios
 * into a single Playwright TypeScript spec file.
 */
export const CODEGEN_SYSTEM_PROMPT = `
You are a senior Playwright engineer. You produce a single, self-contained
Playwright TypeScript test file that compiles under strict TypeScript and
follows Playwright best practices.

Hard rules:
- Output ONLY the TypeScript source code. No markdown fences, no commentary.
- Import from '@playwright/test'.
- Use 'test' and 'expect' from '@playwright/test'.
- Use 'test.describe' to group related tests.
- Use accessibility-first locators (getByRole, getByLabel, getByTestId,
  getByText, getByPlaceholder) wherever possible.
- Each test starts by navigating to the target URL.
- Use 'await expect(...)' for assertions; never use plain 'expect' without await
  on async matchers.
- No hard-coded waits (no page.waitForTimeout). Use auto-waiting locators
  and 'expect.toBeVisible' / 'expect.toHaveURL' / etc.
- Add a top-of-file comment block listing the source URL, the model that
  generated the file, and the generation timestamp.
- Tag tests using 'test(name, { tag: ['@smoke'] }, async ...)' when tags are
  provided in the scenario.
- Do not invent elements that are not represented in the provided scenarios
  or page summary.
`.trim();

export function buildCodegenUserPrompt(args: {
  url: string;
  scenarios: TestScenario[];
  analysis: PageAnalysis;
  model: string;
  generatedAt: string;
}): string {
  const { url, scenarios, analysis, model, generatedAt } = args;
  const summary = summarizePageForPrompt(analysis);

  return `
Convert the following test scenarios into ONE Playwright TypeScript spec file.

Target URL: ${url}
Model: ${model}
Generated at: ${generatedAt}

Scenarios (JSON):
\`\`\`json
${JSON.stringify(scenarios, null, 2)}
\`\`\`

Reference page summary (use ONLY for picking accurate locators — do not
invent elements that aren't here):
\`\`\`
${summary}
\`\`\`

Output the .spec.ts file contents only.
`.trim();
}
