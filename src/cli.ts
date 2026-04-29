#!/usr/bin/env node
import { Command, Option } from 'commander';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { loadConfig } from './config/index.js';
import { PageAnalyzer } from './crawler/page-analyzer.js';
import { TestWriter } from './generator/test-writer.js';
import { rootLogger } from './utils/logger.js';

const program = new Command();

program
  .name('ai-testgen')
  .description('AI-powered Playwright test generation framework (OpenAI GPT-5.5)')
  .version('0.1.0');

program
  .command('generate')
  .alias('gen')
  .description('Crawl a URL and generate a Playwright spec file using AI')
  .requiredOption('-u, --url <url>', 'Target URL to generate tests for')
  .option('-o, --output <dir>', 'Output directory for generated tests')
  .option(
    '-n, --scenarios <count>',
    'Number of scenarios to generate',
    (v) => Number.parseInt(v, 10),
    5,
  )
  .option('-f, --file <name>', 'Output file name (e.g. login.spec.ts)')
  .option('-H, --hint <hint...>', 'One or more hints to focus scenario generation')
  .option('--dry-run', 'Print the generated file path and scenarios without writing to disk', false)
  .addOption(
    new Option('--log-level <level>', 'Override log level')
      .choices(['debug', 'info', 'warn', 'error'])
      .default(undefined),
  )
  .action(async (opts: GenerateCliOptions) => {
    const config = loadConfig(true);
    if (opts.logLevel) {
      config.logLevel = opts.logLevel;
    }
    rootLogger.setLevel(config.logLevel);

    const writer = new TestWriter(config);
    try {
      await writer.start();
      const result = await writer.generate({
        url: opts.url,
        outputDir: opts.output,
        scenarios: opts.scenarios,
        scenarioHints: opts.hint,
        fileName: opts.file,
        dryRun: opts.dryRun ?? false,
      });

      rootLogger.info('--- Generation summary ---');
      rootLogger.info(`URL       : ${result.sourceUrl}`);
      rootLogger.info(`Model     : ${result.model}`);
      rootLogger.info(`File      : ${result.filePath}`);
      rootLogger.info(`Scenarios : ${result.scenarios.length}`);
      for (const [i, s] of result.scenarios.entries()) {
        rootLogger.info(`  ${i + 1}. ${s.name}`);
      }
      if (opts.dryRun) {
        process.stdout.write(`\n${result.code}\n`);
      }
    } finally {
      await writer.stop();
    }
  });

program
  .command('analyze')
  .description('Crawl a URL and print the structured page analysis (no AI call)')
  .requiredOption('-u, --url <url>', 'Target URL to analyze')
  .option('-o, --output <file>', 'Write the analysis to this JSON file')
  .addOption(
    new Option('--log-level <level>', 'Override log level')
      .choices(['debug', 'info', 'warn', 'error'])
      .default(undefined),
  )
  .action(async (opts: AnalyzeCliOptions) => {
    const config = loadConfig(false);
    if (opts.logLevel) {
      config.logLevel = opts.logLevel;
    }
    rootLogger.setLevel(config.logLevel);

    const analyzer = new PageAnalyzer(config);
    try {
      await analyzer.start();
      const analysis = await analyzer.analyze({ url: opts.url });
      const json = `${JSON.stringify(analysis, null, 2)}\n`;
      if (opts.output) {
        const path = isAbsolute(opts.output) ? opts.output : resolve(process.cwd(), opts.output);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, json, 'utf8');
        rootLogger.info(`Wrote analysis to ${path}`);
      } else {
        process.stdout.write(json);
      }
    } finally {
      await analyzer.stop();
    }
  });

program
  .command('config')
  .description('Print the resolved configuration (with the API key redacted)')
  .action(() => {
    const config = loadConfig(false);
    const redacted = {
      ...config,
      openaiApiKey:
        config.openaiApiKey !== '' ? `${config.openaiApiKey.slice(0, 7)}...` : '(unset)',
    };
    process.stdout.write(`${JSON.stringify(redacted, null, 2)}\n`);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  rootLogger.error(message);
  if (err instanceof Error && err.stack && process.env.DEBUG) {
    rootLogger.error(err.stack);
  }
  process.exit(1);
});

interface GenerateCliOptions {
  url: string;
  output?: string;
  scenarios?: number;
  file?: string;
  hint?: string[];
  dryRun?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

interface AnalyzeCliOptions {
  url: string;
  output?: string;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}
