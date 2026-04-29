import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';
import type { PageAnalysis, PageElement, PageForm, PageLink } from '../types/index.js';

const INTERACTIVE_INPUT_TYPES = new Set([
  'text',
  'email',
  'password',
  'search',
  'tel',
  'url',
  'number',
  'date',
  'datetime-local',
  'time',
  'month',
  'week',
  'checkbox',
  'radio',
  'file',
  'submit',
  'button',
]);

/**
 * Parses raw HTML using Cheerio and produces a structured PageAnalysis
 * suitable for prompting the LLM.
 */
export class DomParser {
  parse(html: string, url: string): PageAnalysis {
    const $ = cheerio.load(html);

    const title = ($('title').first().text() || '').trim();
    const description =
      $('meta[name="description"]').attr('content')?.trim() ||
      $('meta[property="og:description"]').attr('content')?.trim() ||
      undefined;

    const headings = this.extractHeadings($);
    const buttons = this.extractButtons($);
    const inputs = this.extractInputs($);
    const links = this.extractLinks($);
    const forms = this.extractForms($);
    const landmarks = this.extractLandmarks($);

    return {
      url,
      title,
      description,
      headings,
      forms,
      links,
      buttons,
      inputs,
      landmarks,
      rawHtmlLength: html.length,
    };
  }

  private extractHeadings($: CheerioAPI): string[] {
    const out: string[] = [];
    $('h1, h2, h3').each((_, el) => {
      const text = $(el).text().trim().replace(/\s+/g, ' ');
      if (text.length > 0 && text.length < 200) {
        out.push(`${el.tagName.toUpperCase()}: ${text}`);
      }
    });
    return out.slice(0, 30);
  }

  private extractButtons($: CheerioAPI): PageElement[] {
    const out: PageElement[] = [];
    $('button, [role="button"], input[type="submit"], input[type="button"]').each((_, el) => {
      const element = this.elementToPageElement($, el, 'button');
      if (element !== null) {
        out.push(element);
      }
    });
    return dedupeElements(out).slice(0, 50);
  }

  private extractInputs($: CheerioAPI): PageElement[] {
    const out: PageElement[] = [];
    $('input, textarea, select').each((_, el) => {
      const tag = el.tagName.toLowerCase();
      const type = ($(el).attr('type') || '').toLowerCase();
      if (tag === 'input' && type !== '' && !INTERACTIVE_INPUT_TYPES.has(type)) {
        return;
      }
      if (tag === 'input' && (type === 'submit' || type === 'button')) {
        return;
      }
      const element = this.elementToPageElement($, el, tag);
      if (element !== null) {
        out.push(element);
      }
    });
    return dedupeElements(out).slice(0, 80);
  }

  private extractLinks($: CheerioAPI): PageLink[] {
    const out: PageLink[] = [];
    $('a[href]').each((_, el) => {
      const href = ($(el).attr('href') || '').trim();
      const text = $(el).text().trim().replace(/\s+/g, ' ');
      if (!href || href.startsWith('javascript:') || href === '#' || text === '') {
        return;
      }
      const selector = this.buildSelector($, el);
      out.push({ text: text.slice(0, 120), href, selector });
    });
    return out.slice(0, 50);
  }

  private extractForms($: CheerioAPI): PageForm[] {
    const out: PageForm[] = [];
    $('form').each((_, el) => {
      const $form = $(el);
      const selector = this.buildSelector($, el);
      const fields: PageElement[] = [];
      $form.find('input, textarea, select').each((_idx, fieldEl) => {
        const tag = fieldEl.tagName.toLowerCase();
        const type = ($(fieldEl).attr('type') || '').toLowerCase();
        if (tag === 'input' && type === 'hidden') {
          return;
        }
        const element = this.elementToPageElement($, fieldEl, tag);
        if (element !== null) {
          fields.push(element);
        }
      });
      const submit = $form.find('button[type="submit"], input[type="submit"]').first();
      const submitSelector =
        submit.length > 0 ? this.buildSelector($, submit.get(0) as Element) : undefined;

      out.push({
        selector,
        action: $form.attr('action') ?? undefined,
        method: ($form.attr('method') || 'get').toLowerCase(),
        fields,
        submitSelector,
      });
    });
    return out.slice(0, 20);
  }

  private extractLandmarks($: CheerioAPI): string[] {
    const out: string[] = [];
    const selectors = [
      'header',
      'nav',
      'main',
      'footer',
      'aside',
      '[role="banner"]',
      '[role="navigation"]',
      '[role="main"]',
      '[role="contentinfo"]',
    ];
    for (const sel of selectors) {
      if ($(sel).length > 0) {
        out.push(sel);
      }
    }
    return out;
  }

  private elementToPageElement($: CheerioAPI, el: Element, tag: string): PageElement | null {
    const $el = $(el);
    const role = $el.attr('role') || undefined;
    const type = $el.attr('type')?.toLowerCase() || undefined;
    const id = $el.attr('id') || undefined;
    const testId =
      $el.attr('data-testid') ||
      $el.attr('data-test') ||
      $el.attr('data-test-id') ||
      $el.attr('data-qa') ||
      undefined;
    const ariaLabel = $el.attr('aria-label') || undefined;
    const placeholder = $el.attr('placeholder') || undefined;
    const name = $el.attr('name') || undefined;
    const text = $el.text().trim().replace(/\s+/g, ' ').slice(0, 100) || undefined;
    const href = $el.attr('href') || undefined;
    const value = $el.attr('value') || undefined;

    const selector = this.buildSelector($, el);
    const preferredLocator = this.suggestLocator({
      tag,
      role,
      type,
      id,
      testId,
      ariaLabel,
      placeholder,
      text,
      name,
    });

    if (
      !id &&
      !testId &&
      !ariaLabel &&
      !placeholder &&
      !text &&
      !name &&
      tag !== 'input' &&
      tag !== 'select' &&
      tag !== 'textarea'
    ) {
      return null;
    }

    return {
      tag,
      role,
      type,
      name,
      id,
      testId,
      ariaLabel,
      placeholder,
      text,
      href,
      value,
      selector,
      preferredLocator,
    };
  }

  private buildSelector($: CheerioAPI, el: Element): string {
    const $el = $(el);
    const id = $el.attr('id');
    if (id !== undefined && id !== '' && /^[a-zA-Z][\w-]*$/.test(id)) {
      return `#${id}`;
    }
    const testId = $el.attr('data-testid') || $el.attr('data-test') || $el.attr('data-qa');
    if (testId !== undefined && testId !== '') {
      return `[data-testid="${testId}"]`;
    }
    const name = $el.attr('name');
    if (name !== undefined && name !== '') {
      return `${el.tagName.toLowerCase()}[name="${name}"]`;
    }
    return el.tagName.toLowerCase();
  }

  private suggestLocator(props: {
    tag: string;
    role?: string;
    type?: string;
    id?: string;
    testId?: string;
    ariaLabel?: string;
    placeholder?: string;
    text?: string;
    name?: string;
  }): string {
    if (props.testId) {
      return `page.getByTestId('${escapeQuotes(props.testId)}')`;
    }
    if (props.ariaLabel) {
      return `page.getByLabel('${escapeQuotes(props.ariaLabel)}')`;
    }
    if (props.placeholder) {
      return `page.getByPlaceholder('${escapeQuotes(props.placeholder)}')`;
    }
    const role = props.role ?? roleFromTag(props.tag, props.type);
    if (role && props.text) {
      return `page.getByRole('${role}', { name: '${escapeQuotes(props.text)}' })`;
    }
    if (role) {
      return `page.getByRole('${role}')`;
    }
    if (props.text && props.tag !== 'input' && props.tag !== 'textarea') {
      return `page.getByText('${escapeQuotes(props.text)}')`;
    }
    if (props.id) {
      return `page.locator('#${props.id}')`;
    }
    if (props.name) {
      return `page.locator('${props.tag}[name="${escapeQuotes(props.name)}"]')`;
    }
    return `page.locator('${props.tag}')`;
  }
}

function roleFromTag(tag: string, type?: string): string | undefined {
  if (tag === 'button') {
    return 'button';
  }
  if (tag === 'a') {
    return 'link';
  }
  if (tag === 'select') {
    return 'combobox';
  }
  if (tag === 'textarea') {
    return 'textbox';
  }
  if (tag === 'input') {
    if (type === 'submit' || type === 'button') {
      return 'button';
    }
    if (type === 'checkbox') {
      return 'checkbox';
    }
    if (type === 'radio') {
      return 'radio';
    }
    return 'textbox';
  }
  return undefined;
}

function escapeQuotes(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function dedupeElements(elements: PageElement[]): PageElement[] {
  const seen = new Set<string>();
  const out: PageElement[] = [];
  for (const el of elements) {
    const key = `${el.tag}|${el.selector}|${el.text ?? ''}|${el.name ?? ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(el);
  }
  return out;
}
