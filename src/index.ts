/**
 * Public entry point for using playwright-ai-testgen as a library.
 *
 * Example:
 *   import { TestWriter, loadConfig } from 'playwright-ai-testgen';
 *
 *   const config = loadConfig();
 *   const writer = new TestWriter(config);
 *   await writer.start();
 *   const result = await writer.generate({ url: 'https://example.com' });
 *   await writer.stop();
 */
export { loadConfig, DEFAULT_MODEL } from './config/index.js';
export { rootLogger, Logger } from './utils/logger.js';
export { DomParser } from './parser/dom.js';
export { summarizePageForPrompt } from './parser/extractor.js';
export { PageAnalyzer } from './crawler/page-analyzer.js';
export { OpenAIClient } from './ai/client.js';
export { AiTestGenerator, parseScenarioJson } from './ai/generator.js';
export {
  SCENARIO_SYSTEM_PROMPT,
  CODEGEN_SYSTEM_PROMPT,
  buildScenarioUserPrompt,
  buildCodegenUserPrompt,
} from './ai/prompts.js';
export { TestWriter } from './generator/test-writer.js';
export { formatTypeScript } from './generator/formatter.js';
export { default as JsonReporter } from './reporter/json-reporter.js';
export type {
  AppConfig,
  LogLevel,
  PageElement,
  PageForm,
  PageLink,
  PageAnalysis,
  TestScenario,
  GeneratedTestFile,
  GenerateOptions,
  JsonReportSummary,
  JsonReportTest,
} from './types/index.js';
