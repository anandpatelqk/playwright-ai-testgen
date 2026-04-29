# playwright-ai-testgen

An AI-powered Playwright test generation framework. Point it at a URL and it
will crawl the page, summarize its accessible structure, ask **OpenAI**
(default model: `gpt-5.5`) to design realistic test scenarios, and emit a
fully-formatted Playwright TypeScript spec file that you can run immediately
with `pnpm test`.

## Tech stack

| Concern | Tool |
| --- | --- |
| Runtime | Node.js 20+ |
| Language | TypeScript (strict mode) |
| Test runner | Playwright 1.48+ |
| LLM SDK | `openai` (default model: `gpt-5.5`) |
| DOM parsing | Cheerio |
| CLI | Commander.js |
| Config / env | dotenv |
| Code formatting | Prettier (formats every generated spec) |
| Reporting | Playwright HTML + custom JSON reporter |
| Linting | ESLint + `@typescript-eslint` + `eslint-plugin-prettier` |
| Build | `tsc` |
| Package manager | pnpm |

## Architecture

```
URL ──► Playwright (Chromium)
          │  (renders the page, waits for network idle)
          ▼
        rendered HTML
          │
          ▼
        Cheerio DOM parser  ──►  PageAnalysis
          │   (forms, buttons, inputs, links,
          │    headings, ARIA landmarks)
          ▼
        prompt builder  ──►  OpenAI Chat Completions
          │   stage 1: design TestScenario[]
          │   stage 2: render Playwright spec
          ▼
        Prettier formatter  ──►  tests/generated/<slug>.spec.ts
                                          │
                                          ▼
                                pnpm test ──►  HTML report + custom JSON report
```

Source layout:

```
src/
  ai/            OpenAI client, prompts, two-stage generator
  config/        dotenv-backed AppConfig loader
  crawler/       Playwright-driven page analyzer
  generator/     Disk writer + Prettier integration
  parser/        Cheerio-based DOM parser + LLM summarizer
  reporter/      Custom JSON reporter for Playwright
  types/         Shared TypeScript types
  utils/         Leveled logger
  cli.ts         Commander.js entry point (`ai-testgen`)
  index.ts       Public library exports
tests/
  example.spec.ts        Hand-written smoke test
  generated/             AI-generated specs land here
playwright.config.ts     Test runner configuration
```

## Quick start

### 1. Install

```bash
pnpm install
pnpm exec playwright install
```

### 2. Configure

Copy the example env file and add your OpenAI API key:

```bash
cp .env.example .env
# then edit .env
```

Required:

- `OPENAI_API_KEY` — your OpenAI API key (starts with `sk-...`)

Useful overrides:

- `OPENAI_MODEL` (default `gpt-5.5`) — any chat-completions-capable model,
  e.g. `gpt-5.5`, `gpt-5.4-mini`, `gpt-4.1`, `gpt-4o`
- `OPENAI_MAX_TOKENS` (default `8192`)
- `OPENAI_ORG_ID` / `OPENAI_PROJECT_ID` — only needed for org-scoped keys
- `OPENAI_BASE_URL` — point at Azure OpenAI or any compatible proxy
- `TARGET_BASE_URL` (default `https://example.com`)
- `GENERATED_TESTS_DIR` (default `tests/generated`)
- `REPORTS_DIR` (default `reports`)
- `LOG_LEVEL` (`debug` | `info` | `warn` | `error`)

### 3. Build

```bash
pnpm run build
```

### 4. Generate tests for a URL

```bash
# Build first, then run the bundled CLI
pnpm run build
node dist/cli.js generate --url https://example.com --scenarios 5

# Or, during development, use tsx (no build step needed)
pnpm run dev generate --url https://example.com --scenarios 5
```

The generated spec lands in `tests/generated/<slug>-<timestamp>.spec.ts`.

### 5. Run the tests

```bash
pnpm test                # headless on Chromium, Firefox, WebKit
pnpm run test:headed     # headed
pnpm run test:ui         # Playwright UI mode
pnpm run test:report     # open the latest HTML report
```

The custom JSON reporter writes a flat summary to `reports/results.json`:

```json
{
  "startedAt": "2026-04-27T16:00:00.000Z",
  "finishedAt": "2026-04-27T16:00:42.123Z",
  "durationMs": 42123,
  "total": 6,
  "passed": 5,
  "failed": 1,
  "flaky": 0,
  "skipped": 0,
  "results": [ ... ]
}
```

## CLI reference

```
ai-testgen generate [options]

  -u, --url <url>           Target URL to generate tests for      (required)
  -o, --output <dir>        Output directory                      (default: $GENERATED_TESTS_DIR)
  -n, --scenarios <count>   Number of scenarios to generate       (default: 5)
  -f, --file <name>         Output file name (e.g. login.spec.ts)
  -H, --hint <hint...>      One or more focus-area hints
      --dry-run             Print the generated file without writing
      --log-level <level>   debug | info | warn | error

ai-testgen analyze [options]

  -u, --url <url>           Target URL to analyze                  (required)
  -o, --output <file>       Write the analysis to a JSON file
      --log-level <level>   debug | info | warn | error

ai-testgen config           Print the resolved configuration (API key redacted)
```

Examples:

```bash
# Generate 8 scenarios, focused on authentication
node dist/cli.js generate \
  --url https://app.example.com/login \
  --scenarios 8 \
  --hint "login with valid credentials" \
  --hint "show validation errors for empty fields" \
  --hint "redirect to /dashboard on success"

# Inspect what the parser sees on a page (no AI call, no API key needed)
node dist/cli.js analyze --url https://example.com --output analysis.json

# Verify your environment
node dist/cli.js config
```

## Library usage

You can also use the framework programmatically:

```ts
import { TestWriter, loadConfig } from 'playwright-ai-testgen';

const config = loadConfig();
const writer = new TestWriter(config);

await writer.start();
try {
  const result = await writer.generate({
    url: 'https://example.com',
    scenarios: 5,
    scenarioHints: ['cover the search box'],
  });
  console.log(`Wrote ${result.filePath}`);
} finally {
  await writer.stop();
}
```

If you want to talk to the model directly:

```ts
import { OpenAIClient, loadConfig } from 'playwright-ai-testgen';

const client = new OpenAIClient(loadConfig());
const text = await client.complete({
  system: 'You are a helpful assistant.',
  user: 'Say hi.',
});
console.log(text);
```

## How it works

1. **Crawl** — A headless Chromium instance loads the URL, waits for
   `domcontentloaded` and (briefly) `networkidle`, then captures the rendered
   HTML.
2. **Parse** — Cheerio walks the HTML and extracts only the elements that
   matter for testing: forms, buttons, inputs, links, headings, and ARIA
   landmarks. Each element is paired with a *preferred Playwright locator*
   chosen using the priority order: `getByTestId` → `getByLabel` →
   `getByPlaceholder` → `getByRole` → `getByText` → `#id` → `tag[name=...]`.
3. **Design scenarios** — A first call to OpenAI produces a strict JSON array
   of `TestScenario` objects (name, description, steps, assertions, tags).
   The response is parsed and validated with `parseScenarioJson`.
4. **Generate code** — A second call to OpenAI takes the validated scenarios
   plus the page summary and emits a single `.spec.ts` file that imports
   from `@playwright/test`.
5. **Format** — The output is run through Prettier (using your project
   `.prettierrc`) before being written to disk.
6. **Run** — `pnpm test` executes the generated specs against
   `TARGET_BASE_URL` on Chromium, Firefox, and WebKit, and the custom JSON
   reporter writes `reports/results.json`.

## Switching models

The framework speaks the standard Chat Completions API, so swapping models is
a one-line change:

```bash
# Use a smaller / cheaper model
OPENAI_MODEL=gpt-5.4-mini pnpm run generate -- --url https://example.com

# Use a previous-generation model
OPENAI_MODEL=gpt-4.1 pnpm run generate -- --url https://example.com

# Point at Azure OpenAI or a compatible proxy
OPENAI_BASE_URL=https://my-proxy.example/v1 OPENAI_MODEL=gpt-5.5 pnpm run generate ...
```

## Scripts

| Script | Description |
| --- | --- |
| `pnpm run build` | Compile TypeScript to `dist/` |
| `pnpm run dev` | Run the CLI directly via `tsx` (no build) |
| `pnpm run lint` | ESLint over `src/` |
| `pnpm run lint:fix` | ESLint with autofix |
| `pnpm run format` | Prettier write `src/**/*.ts` |
| `pnpm run typecheck` | `tsc --noEmit` |
| `pnpm test` | Run the Playwright suite |
| `pnpm run test:ui` | Playwright UI mode |
| `pnpm run test:report` | Open the latest HTML report |
| `pnpm run generate` | Build + run the generator (`generate` subcommand) |

## License

MIT.
