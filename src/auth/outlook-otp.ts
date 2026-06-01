/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Reads a DevRev OTP from an Outlook / Office 365 inbox via IMAP.
 * Used automatically in CI environments where a human cannot type the code.
 *
 * Requires optional peer dependencies:
 *   npm install imap mailparser @types/imap @types/mailparser
 */

const OTP_PATTERNS = [
  /Your code is:\s*(\d{6})/,
  /(\d{6})(?= is your authentication code)/,
  /code[:\s]*(\d{6})/i,
  /verification[:\s]*(\d{6})/i,
  /(\d{6})/,
];

export async function readOtpFromOutlook(
  username: string,
  password: string,
): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Imap = require('imap');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { simpleParser } = require('mailparser');

  const lookbackMinutes = 5;
  const timeoutMs = 30_000;

  return new Promise((resolve, reject) => {
    let imap: any;

    const timer = setTimeout(() => {
      try {
        if (imap && imap.state !== 'disconnected') imap.end();
      } catch { /* ignore */ }
      reject(new Error(`OTP fetch timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const cleanup = (result: string | null, error?: Error) => {
      clearTimeout(timer);
      try {
        if (imap && imap.state !== 'disconnected') imap.end();
      } catch { /* ignore */ }
      if (error) reject(error);
      else resolve(result);
    };

    imap = new Imap({
      user: username,
      password,
      host: 'outlook.office365.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 10_000,
    });

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err: any) => {
        if (err) return cleanup(null, err);

        const sinceDate = new Date(Date.now() - lookbackMinutes * 60 * 1000);
        imap.search([['SINCE', sinceDate]], (searchErr: any, results: any[]) => {
          if (searchErr) return cleanup(null, searchErr);
          if (!results || results.length === 0) return cleanup(null);

          const candidates: Array<{ otp: string; timestamp: Date }> = [];
          let processed = 0;

          const fetch = imap.fetch(results, { bodies: '', markSeen: true });

          fetch.on('message', (msg: any) => {
            let raw = '';
            msg.on('body', (stream: any) => {
              stream.on('data', (chunk: Buffer) => { raw += chunk.toString('utf8'); });
              stream.once('end', async () => {
                try {
                  const parsed = await simpleParser(raw);
                  const fromText: string = parsed.from?.text ?? '';
                  const subject: string = parsed.subject ?? '';
                  const text: string = parsed.text ?? '';
                  const receivedDate: Date = parsed.date ? new Date(parsed.date) : new Date();

                  if (
                    fromText.includes('otp@devrev.ai') &&
                    subject.includes('[DevRev] Login verification code')
                  ) {
                    for (const pattern of OTP_PATTERNS) {
                      const match = text.match(pattern);
                      if (match?.[1]) {
                        candidates.push({ otp: match[1], timestamp: receivedDate });
                        break;
                      }
                    }
                  }
                } catch { /* ignore parse errors */ }
                finally {
                  processed++;
                  if (processed === results.length) {
                    if (candidates.length === 0) return cleanup(null);
                    candidates.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    cleanup(candidates[0]!.otp);
                  }
                }
              });
            });

            msg.once('error', () => {
              processed++;
              if (processed === results.length) {
                if (candidates.length === 0) return cleanup(null);
                candidates.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                cleanup(candidates[0]!.otp);
              }
            });
          });

          fetch.once('error', (fetchErr: Error) => cleanup(null, fetchErr));
        });
      });
    });

    imap.once('error', (err: Error) => cleanup(null, err));
    imap.once('end', () => clearTimeout(timer));

    try {
      imap.connect();
    } catch (err) {
      cleanup(null, err as Error);
    }
  });
}
