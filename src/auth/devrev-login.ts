import * as readline from 'node:readline';
import type { BrowserContext, Page } from 'playwright';
import { rootLogger } from '../utils/logger.js';

const log = rootLogger.child('devrev-login');

function promptForOtp(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Logs into DevRev using email OTP flow.
 *
 * In CI (`CI=true`) it reads the OTP automatically from Outlook via IMAP.
 * Locally it prompts the operator in the terminal.
 *
 * After successful login the browser context's storage state is reused
 * by subsequent pages in the same context, so no re-login is required.
 */
export async function loginToDevRev(
  context: BrowserContext,
  opts: {
    email: string;
    outlookPassword?: string;
    baseUrl: string;
  },
): Promise<void> {
  const { email, outlookPassword, baseUrl } = opts;

  log.info(`Logging in to DevRev as ${email} …`);

  const page: Page = await context.newPage();

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // Fill email and submit
    const emailField = page.locator('input[id="1-email"]');
    await emailField.waitFor({ state: 'visible', timeout: 30_000 });
    await emailField.fill(email);

    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();

    let otp: string;

    if (process.env.CI) {
      // In CI: read OTP from Outlook IMAP automatically.
      // Requires: npm install imap mailparser @types/imap @types/mailparser
      log.info('CI mode: fetching OTP from Outlook inbox (waiting 10 s for email to arrive)…');
      await page.waitForTimeout(10_000);
      let readOtpFromOutlook: (u: string, p: string) => Promise<string | null>;
      try {
        ({ readOtpFromOutlook } = await import('./outlook-otp.js'));
      } catch {
        throw new Error(
          'Could not load outlook-otp module. ' +
          'In CI, run: npm install imap mailparser @types/imap @types/mailparser',
        );
      }
      const fetched = await readOtpFromOutlook(email, outlookPassword ?? '');
      if (!fetched) {
        throw new Error('OTP not found in Outlook inbox. Check DEVREV_OUTLOOK_PASSWORD and IMAP access.');
      }
      otp = fetched;
      log.info('OTP retrieved from Outlook.');
    } else {
      // Locally: ask the operator
      console.log('\n[DevRev Login] An OTP has been sent to ' + email);
      console.log('Check your Outlook inbox and enter it below.\n');
      otp = await promptForOtp('Enter OTP: ');
      if (!otp) {
        throw new Error('No OTP entered — cannot authenticate with DevRev.');
      }
    }

    const otpField = page.locator('input[id="1-vcode"]');
    await otpField.waitFor({ state: 'visible', timeout: 30_000 });
    await otpField.fill(otp);

    const otpSubmit = page.locator('button[id="1-submit"]');
    await otpSubmit.click();

    // Wait for the app shell to load (updates nav element appears after login)
    await page.waitForSelector('//span[@data-drid="updates--page--slot-label"]', {
      timeout: 60_000,
    });

    log.info('DevRev login successful.');
  } finally {
    await page.close();
  }
}
