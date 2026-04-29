import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { DomParser } from '../parser/dom.js';
import type { AppConfig, PageAnalysis } from '../types/index.js';
import { rootLogger } from '../utils/logger.js';

export interface AnalyzeOptions {
  url: string;
  waitForSelector?: string;
}

/**
 * Crawls a URL with Playwright (Chromium, headless) and extracts a structured
 * PageAnalysis using the Cheerio-based DomParser.
 *
 * Designed to be used once per generation run:
 *   const analyzer = new PageAnalyzer(config);
 *   await analyzer.start();
 *   const analysis = await analyzer.analyze({ url });
 *   await analyzer.stop();
 */
export class PageAnalyzer {
  private readonly config: AppConfig;
  private readonly parser: DomParser;
  private browser?: Browser;
  private context?: BrowserContext;
  private readonly log = rootLogger.child('crawler');

  constructor(config: AppConfig) {
    this.config = config;
    this.parser = new DomParser();
    this.log.setLevel(config.logLevel);
  }

  async start(): Promise<void> {
    if (this.browser) {
      return;
    }
    this.log.debug('Launching headless Chromium...');
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (compatible; playwright-ai-testgen/0.1; +https://github.com/your-org)',
    });
  }

  async stop(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = undefined;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined;
    }
    this.log.debug('Browser closed.');
  }

  async analyze({ url, waitForSelector }: AnalyzeOptions): Promise<PageAnalysis> {
    if (!this.context) {
      throw new Error('PageAnalyzer not started. Call start() before analyze().');
    }

    const page: Page = await this.context.newPage();
    try {
      this.log.info(`Navigating to ${url}`);
      await page.goto(url, {
        timeout: this.config.pageLoadTimeoutMs,
        waitUntil: 'domcontentloaded',
      });

      try {
        await page.waitForLoadState('networkidle', {
          timeout: this.config.pageIdleTimeoutMs,
        });
      } catch {
        this.log.debug('Network idle timeout exceeded; continuing.');
      }

      if (waitForSelector !== undefined && waitForSelector !== '') {
        await page.waitForSelector(waitForSelector, {
          timeout: this.config.pageLoadTimeoutMs,
        });
      }

      const html = await page.content();
      const analysis = this.parser.parse(html, page.url());
      this.log.info(
        `Analyzed ${page.url()} — buttons:${analysis.buttons.length} ` +
          `inputs:${analysis.inputs.length} links:${analysis.links.length} forms:${analysis.forms.length}`,
      );
      return analysis;
    } finally {
      await page.close();
    }
  }
}
