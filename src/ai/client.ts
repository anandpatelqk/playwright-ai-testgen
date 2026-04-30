import OpenAI from 'openai';
import type { AppConfig } from '../types/index.js';
import { rootLogger } from '../utils/logger.js';

export interface CompleteOptions {
  system: string;
  user: string;
  /** Override the configured max output tokens for this call. */
  maxTokens?: number;
  /** Sampling temperature; defaults to 0.2 for deterministic-ish output. */
  temperature?: number;
  /** Force structured JSON output via response_format={type:'json_object'}. */
  jsonMode?: boolean;
}

/**
 * Thin wrapper around the official OpenAI SDK with project conventions:
 * - pinned model from config (default: gpt-5.5)
 * - low temperature for deterministic test generation
 * - text-only completion helper that strips fences and trims output
 */
export class OpenAIClient {
  private readonly sdk: OpenAI;
  private readonly config: AppConfig;
  private readonly log = rootLogger.child('openai');

  constructor(config: AppConfig) {
    if (!config.openaiApiKey) {
      throw new Error('OpenAIClient requires openaiApiKey to be set in config.');
    }
    this.config = config;
    this.sdk = new OpenAI({
      apiKey: config.openaiApiKey,
      baseURL: config.openaiBaseUrl ?? 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/anandpatelqk/airdrop-zoho-snap-in',
        'X-OpenRouter-Title': 'playwright-ai-testgen',
      },
    });
    this.log.setLevel(config.logLevel);
  }

  get model(): string {
    return this.config.openaiModel;
  }

  /**
   * Run a single non-streaming chat completion and return the first choice's
   * trimmed text content.
   */
  async complete({
    system,
    user,
    maxTokens,
    temperature = 0.2,
    jsonMode = false,
  }: CompleteOptions): Promise<string> {
    const max = maxTokens ?? this.config.openaiMaxTokens;
    this.log.debug(
      `Calling ${this.config.openaiModel} (max_tokens=${max}, temperature=${temperature}, json=${jsonMode})`,
    );

    const response = await this.sdk.chat.completions.create({
      model: this.config.openaiModel,
      max_tokens: max,
      temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: jsonMode ? { type: 'json_object' } : { type: 'text' },
    });

    const choice = response.choices[0];
    if (!choice) {
      throw new Error('OpenAI returned no choices.');
    }
    const text = (choice.message.content ?? '').trim();

    if (response.usage) {
      this.log.debug(
        `Response: finish_reason=${choice.finish_reason ?? 'unknown'} ` +
          `usage=in:${response.usage.prompt_tokens}/out:${response.usage.completion_tokens}`,
      );
    }

    return stripFences(text);
  }
}

/**
 * Removes leading/trailing markdown code fences if the model added them despite
 * being told not to.
 */
function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = /^```(?:[a-zA-Z0-9]+)?\s*\n([\s\S]*?)\n```$/.exec(trimmed);
  if (fenceMatch && fenceMatch[1] !== undefined) {
    return fenceMatch[1].trim();
  }
  return trimmed;
}
