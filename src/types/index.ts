/**
 * Shared type definitions for the playwright-ai-testgen framework.
 *
 * These types are used across the parser, AI client, generator, and reporter.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AppConfig {
  openaiApiKey: string;
  openaiModel: string;
  openaiMaxTokens: number;
  openaiOrgId?: string;
  openaiProjectId?: string;
  openaiBaseUrl?: string;
  targetBaseUrl: string;
  generatedTestsDir: string;
  reportsDir: string;
  pageLoadTimeoutMs: number;
  pageIdleTimeoutMs: number;
  logLevel: LogLevel;
  /** DevRev authentication */
  devrevEmail?: string;
  devrevOutlookPassword?: string;
  devrevBaseUrl?: string;
}

/** A single interactive element extracted from the page DOM. */
export interface PageElement {
  tag: string;
  role?: string;
  type?: string;
  name?: string;
  id?: string;
  testId?: string;
  ariaLabel?: string;
  placeholder?: string;
  text?: string;
  href?: string;
  value?: string;
  selector: string;
  /** Suggested Playwright locator strategy, e.g. `getByRole`. */
  preferredLocator?: string;
}

/** A high-level summary of the page used as input to the LLM. */
export interface PageAnalysis {
  url: string;
  title: string;
  description?: string;
  headings: string[];
  forms: PageForm[];
  links: PageLink[];
  buttons: PageElement[];
  inputs: PageElement[];
  landmarks: string[];
  rawHtmlLength: number;
}

export interface PageForm {
  selector: string;
  action?: string;
  method?: string;
  fields: PageElement[];
  submitSelector?: string;
}

export interface PageLink {
  text: string;
  href: string;
  selector: string;
}

/** A scenario the AI should generate a test for. */
export interface TestScenario {
  name: string;
  description: string;
  tags?: string[];
  steps: string[];
  assertions: string[];
}

/** Output produced by the AI generator before being written to disk. */
export interface GeneratedTestFile {
  fileName: string;
  filePath: string;
  code: string;
  scenarios: TestScenario[];
  sourceUrl: string;
  model: string;
  generatedAt: string;
}

export interface GenerateOptions {
  url: string;
  outputDir?: string;
  scenarios?: number;
  scenarioHints?: string[];
  fileName?: string;
  dryRun?: boolean;
}

/** Stats emitted by the custom JSON reporter. */
export interface JsonReportSummary {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  results: JsonReportTest[];
}

export interface JsonReportTest {
  title: string;
  fullTitle: string;
  file: string;
  project: string;
  status: 'passed' | 'failed' | 'flaky' | 'skipped' | 'timedOut' | 'interrupted';
  durationMs: number;
  retries: number;
  errors: string[];
}
