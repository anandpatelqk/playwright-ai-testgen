import type { AppConfig, PageAnalysis, TestScenario } from '../types/index.js';
import { rootLogger } from '../utils/logger.js';
import { OpenAIClient } from './client.js';
import {
  CODEGEN_SYSTEM_PROMPT,
  SCENARIO_SYSTEM_PROMPT,
  buildCodegenUserPrompt,
  buildScenarioUserPrompt,
} from './prompts.js';

/**
 * Two-stage AI test generator:
 *   1. designScenarios — produces a JSON array of TestScenarios
 *   2. generateTestCode — converts scenarios into a Playwright .spec.ts file
 */
export class AiTestGenerator {
  private readonly client: OpenAIClient;
  private readonly log = rootLogger.child('ai-generator');

  constructor(config: AppConfig, client?: OpenAIClient) {
    this.client = client ?? new OpenAIClient(config);
    this.log.setLevel(config.logLevel);
  }

  get model(): string {
    return this.client.model;
  }

  async designScenarios(
    analysis: PageAnalysis,
    scenarioCount: number,
    hints: string[] = [],
  ): Promise<TestScenario[]> {
    this.log.info(`Designing ${scenarioCount} scenarios for ${analysis.url}`);
    const raw = await this.client.complete({
      system: SCENARIO_SYSTEM_PROMPT,
      user: buildScenarioUserPrompt(analysis, scenarioCount, hints),
      temperature: 0.3,
    });

    const scenarios = parseScenarioJson(raw);
    if (scenarios.length === 0) {
      throw new Error('AI returned no scenarios. Check API key, model, or page input.');
    }
    this.log.info(`Received ${scenarios.length} scenarios from the model.`);
    return scenarios;
  }

  async generateTestCode(args: {
    url: string;
    analysis: PageAnalysis;
    scenarios: TestScenario[];
    generatedAt: string;
  }): Promise<string> {
    const { url, analysis, scenarios, generatedAt } = args;
    this.log.info(`Generating Playwright spec code for ${scenarios.length} scenarios.`);

    const code = await this.client.complete({
      system: CODEGEN_SYSTEM_PROMPT,
      user: buildCodegenUserPrompt({
        url,
        analysis,
        scenarios,
        model: this.model,
        generatedAt,
      }),
      temperature: 0.1,
    });

    if (!code.includes('@playwright/test')) {
      throw new Error(
        "AI output does not appear to be a Playwright spec (missing '@playwright/test' import).",
      );
    }
    return code;
  }
}

/**
 * Parses the model's JSON response into TestScenario[], tolerating extra
 * whitespace, accidental fences, or surrounding prose by extracting the first
 * JSON array we can find.
 */
export function parseScenarioJson(raw: string): TestScenario[] {
  let text = raw.trim();

  if (!text.startsWith('[')) {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end === -1 || end < start) {
      throw new Error('AI response did not contain a JSON array of scenarios.');
    }
    text = text.slice(start, end + 1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Failed to parse scenario JSON from AI response: ${(err as Error).message}\n` +
        `--- response start ---\n${raw}\n--- response end ---`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error('AI response JSON was not an array.');
  }

  return parsed.map((item, index) => coerceScenario(item, index));
}

function coerceScenario(value: unknown, index: number): TestScenario {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Scenario at index ${index} is not an object.`);
  }
  const obj = value as Record<string, unknown>;
  const name = requireString(obj.name, `scenarios[${index}].name`);
  const description = requireString(obj.description, `scenarios[${index}].description`);
  const steps = requireStringArray(obj.steps, `scenarios[${index}].steps`);
  const assertions = requireStringArray(obj.assertions, `scenarios[${index}].assertions`);
  const tags =
    obj.tags === undefined ? undefined : requireStringArray(obj.tags, `scenarios[${index}].tags`);

  return { name, description, steps, assertions, tags };
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Expected non-empty string at ${path}.`);
  }
  return value.trim();
}

function requireStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected array at ${path}.`);
  }
  return value.map((item, i) => {
    if (typeof item !== 'string') {
      throw new Error(`Expected string at ${path}[${i}].`);
    }
    return item;
  });
}
