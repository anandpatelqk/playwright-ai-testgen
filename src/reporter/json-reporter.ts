import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { relative } from 'node:path';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import type { JsonReportSummary, JsonReportTest } from '../types/index.js';

interface JsonReporterOptions {
  /** Path to the output JSON file. Relative paths are resolved from cwd. */
  outputFile?: string;
}

/**
 * Custom Playwright JSON reporter.
 *
 * Produces a single, opinionated JSON file that's easier to diff and consume
 * from CI dashboards than Playwright's built-in JSON reporter:
 *
 *   {
 *     startedAt, finishedAt, durationMs,
 *     total, passed, failed, flaky, skipped,
 *     results: [{ title, fullTitle, file, project, status, durationMs, retries, errors }]
 *   }
 */
export default class JsonReporter implements Reporter {
  private readonly outputFile: string;
  private readonly results: JsonReportTest[] = [];
  private startedAtMs = 0;
  private rootDir = process.cwd();

  constructor(options: JsonReporterOptions = {}) {
    const target = options.outputFile ?? 'reports/results.json';
    this.outputFile = isAbsolute(target) ? target : resolve(process.cwd(), target);
  }

  onBegin(config: FullConfig, _suite: Suite): void {
    this.startedAtMs = Date.now();
    this.rootDir = config.rootDir ?? process.cwd();
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const ancestors = collectTitlePath(test);
    const fileRelative = relative(this.rootDir, test.location.file) || test.location.file;
    const errors = result.errors
      // eslint-disable-next-line no-control-regex
      .map((e) => (e.message ?? '').replace(/\u001b\[[0-9;]*m/g, '').trim())
      .filter((m) => m !== '');

    this.results.push({
      title: test.title,
      fullTitle: ancestors.join(' > '),
      file: fileRelative,
      project: test.parent.project()?.name ?? 'default',
      status: mapStatus(test, result),
      durationMs: result.duration,
      retries: result.retry,
      errors,
    });
  }

  onEnd(_result: FullResult): void | Promise<void> {
    const finishedAtMs = Date.now();
    const counts = this.tallyCounts();

    const summary: JsonReportSummary = {
      startedAt: new Date(this.startedAtMs).toISOString(),
      finishedAt: new Date(finishedAtMs).toISOString(),
      durationMs: finishedAtMs - this.startedAtMs,
      ...counts,
      results: this.results,
    };

    mkdirSync(dirname(this.outputFile), { recursive: true });
    writeFileSync(this.outputFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    // eslint-disable-next-line no-console
    console.log(
      `[json-reporter] Wrote ${counts.total} test results to ${this.outputFile} ` +
        `(passed=${counts.passed}, failed=${counts.failed}, flaky=${counts.flaky}, skipped=${counts.skipped})`,
    );
  }

  printsToStdio(): boolean {
    return false;
  }

  private tallyCounts(): {
    total: number;
    passed: number;
    failed: number;
    flaky: number;
    skipped: number;
  } {
    let passed = 0;
    let failed = 0;
    let flaky = 0;
    let skipped = 0;
    for (const r of this.results) {
      switch (r.status) {
        case 'passed':
          passed += 1;
          break;
        case 'failed':
        case 'timedOut':
        case 'interrupted':
          failed += 1;
          break;
        case 'flaky':
          flaky += 1;
          break;
        case 'skipped':
          skipped += 1;
          break;
        default:
          break;
      }
    }
    return { total: this.results.length, passed, failed, flaky, skipped };
  }
}

function collectTitlePath(test: TestCase): string[] {
  const path: string[] = [];
  let current: Suite | TestCase | undefined = test;
  while (current) {
    if (current.title) {
      path.unshift(current.title);
    }
    current = (current as { parent?: Suite }).parent;
  }
  return path;
}

function mapStatus(test: TestCase, result: TestResult): JsonReportTest['status'] {
  const outcome = test.outcome();
  if (outcome === 'flaky') {
    return 'flaky';
  }
  if (outcome === 'skipped') {
    return 'skipped';
  }
  switch (result.status) {
    case 'passed':
      return 'passed';
    case 'failed':
      return 'failed';
    case 'timedOut':
      return 'timedOut';
    case 'interrupted':
      return 'interrupted';
    case 'skipped':
      return 'skipped';
    default:
      return 'failed';
  }
}
