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

DEVREV LOGIN REQUIREMENT (mandatory when the target URL is on app.devrev.ai):
- Read credentials from process.env: DEVREV_EMAIL, DEVREV_OUTLOOK_PASSWORD, DEVREV_BASE_URL.
- Every test must begin with the shared loginToDevRev helper shown below.
  Use a test.beforeEach that calls it so every test in the describe block is
  authenticated before navigating to the target page.

Helper to include verbatim at the top of the generated spec file
(before the describe block):

\`\`\`typescript
import * as readline from 'node:readline';
import * as dotenv from 'dotenv';
dotenv.config();

async function promptOtp(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => { rl.question(question, (a) => { rl.close(); resolve(a.trim()); }); });
}

async function loginToDevRev(page: import('@playwright/test').Page): Promise<void> {
  const email    = process.env.DEVREV_EMAIL            ?? '';
  const baseUrl  = process.env.DEVREV_BASE_URL         ?? 'https://app.devrev.ai';

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('input[id="1-email"]').waitFor({ state: 'visible' });
  await page.locator('input[id="1-email"]').fill(email);
  await page.locator('button[type="submit"]').click();

  // In CI the OTP is injected via the CI_OTP env var; locally the operator types it.
  let otp: string;
  if (process.env.CI && process.env.CI_OTP) {
    otp = process.env.CI_OTP;
  } else {
    console.log('\\n[DevRev Login] OTP sent to ' + email + '. Check your inbox.');
    otp = await promptOtp('Enter OTP: ');
  }

  await page.locator('input[id="1-vcode"]').waitFor({ state: 'visible' });
  await page.locator('input[id="1-vcode"]').fill(otp);
  await page.locator('button[id="1-submit"]').click();

  // Wait for the app shell (nav indicator that login succeeded)
  await page.waitForSelector('//span[@data-drid="updates--page--slot-label"]', { timeout: 60000 });
}
\`\`\`

Place this helper before the first test.describe block.
In each test.beforeEach call: await loginToDevRev(page);
After login navigate to the specific target URL for the scenario.
`.trim();

export function buildCodegenUserPrompt(args: {
  url: string;
  scenarios: TestScenario[];
  analysis: PageAnalysis;
  model: string;
  generatedAt: string;
  devrevEmail?: string;
  devrevBaseUrl?: string;
}): string {
  const { url, scenarios, analysis, model, generatedAt, devrevEmail, devrevBaseUrl } = args;
  const summary = summarizePageForPrompt(analysis);

  const isDevRev = url.includes('app.devrev.ai');
  const authNote = isDevRev
    ? `\nAuthentication: This is a DevRev page. Include the loginToDevRev helper described in ` +
      `the system prompt. Use DEVREV_EMAIL="${devrevEmail ?? 'process.env.DEVREV_EMAIL'}" and ` +
      `DEVREV_BASE_URL="${devrevBaseUrl ?? 'https://app.devrev.ai'}" as the defaults in the helper.\n`
    : '';

  return `
Convert the following test scenarios into ONE Playwright TypeScript spec file.

Target URL: ${url}
Model: ${model}
Generated at: ${generatedAt}
${authNote}
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
