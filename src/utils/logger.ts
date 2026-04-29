import type { LogLevel } from '../types/index.js';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** A tiny, dependency-free leveled logger with timestamp prefixes. */
export class Logger {
  private level: LogLevel;
  private readonly scope: string;

  constructor(scope = 'app', level: LogLevel = 'info') {
    this.scope = scope;
    this.level = level;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  child(scope: string): Logger {
    return new Logger(`${this.scope}:${scope}`, this.level);
  }

  debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log('info', message, args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log('error', message, args);
  }

  private log(level: LogLevel, message: string, args: unknown[]): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.level]) {
      return;
    }
    const ts = new Date().toISOString();
    const prefix = `[${ts}] [${level.toUpperCase()}] [${this.scope}]`;
    const stream =
      level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    if (args.length > 0) {
      stream(prefix, message, ...args);
    } else {
      stream(prefix, message);
    }
  }
}

export const rootLogger = new Logger('ai-testgen');
