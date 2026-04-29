import * as dotenv from 'dotenv';
import type { AppConfig, LogLevel } from '../types/index.js';

dotenv.config();

/**
 * Default OpenAI model.
 * Override via `OPENAI_MODEL` in the environment if you need to.
 */
export const DEFAULT_MODEL = 'nvidia/nemotron-3-super-120b-a12b';  // or any openrouter model id

const VALID_LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'] as const;

function readEnv(key: string, fallback?: string): string | undefined {
  const value = process.env[key];
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  return value;
}

function readEnvInt(key: string, fallback: number): number {
  const raw = readEnv(key);
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be an integer; got "${raw}".`);
  }
  return parsed;
}

function readEnvLogLevel(key: string, fallback: LogLevel): LogLevel {
  const raw = readEnv(key);
  if (raw === undefined) {
    return fallback;
  }
  const lower = raw.toLowerCase() as LogLevel;
  if (!VALID_LOG_LEVELS.includes(lower)) {
    throw new Error(
      `Environment variable ${key} must be one of ${VALID_LOG_LEVELS.join(', ')}; got "${raw}".`,
    );
  }
  return lower;
}

/**
 * Loads and validates the application configuration from environment variables.
 *
 * @param requireApiKey - When true (default), throws if `OPENAI_API_KEY` is missing.
 *                        Set to false for commands that don't call the LLM.
 */
export function loadConfig(requireApiKey = true): AppConfig {
  const openaiApiKey = readEnv('OPENAI_API_KEY', '') ?? '';
  if (requireApiKey && openaiApiKey === '') {
    throw new Error(
      'OPENAI_API_KEY is not set. Copy .env.example to .env and add your key, ' +
        'or export OPENAI_API_KEY in your shell.',
    );
  }

  return {
    openaiApiKey,
    openaiModel: readEnv('OPENAI_MODEL', DEFAULT_MODEL) ?? DEFAULT_MODEL,
    openaiMaxTokens: readEnvInt('OPENAI_MAX_TOKENS', 8192),
    openaiOrgId: readEnv('OPENAI_ORG_ID'),
    openaiProjectId: readEnv('OPENAI_PROJECT_ID'),
    openaiBaseUrl: readEnv('OPENAI_BASE_URL'),
    targetBaseUrl: readEnv('TARGET_BASE_URL', 'https://example.com') ?? 'https://example.com',
    generatedTestsDir: readEnv('GENERATED_TESTS_DIR', 'tests/generated') ?? 'tests/generated',
    reportsDir: readEnv('REPORTS_DIR', 'reports') ?? 'reports',
    pageLoadTimeoutMs: readEnvInt('PAGE_LOAD_TIMEOUT_MS', 30_000),
    pageIdleTimeoutMs: readEnvInt('PAGE_IDLE_TIMEOUT_MS', 2_000),
    logLevel: readEnvLogLevel('LOG_LEVEL', 'info'),
  };
}
