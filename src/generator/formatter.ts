import * as prettier from 'prettier';
import { rootLogger } from '../utils/logger.js';

const log = rootLogger.child('formatter');

/**
 * Formats a generated TypeScript file with the project's Prettier config.
 *
 * If Prettier fails (for example, the AI emitted invalid TS that can't be
 * parsed), we fall back to the unformatted source so the user can still
 * inspect and fix it manually.
 */
export async function formatTypeScript(source: string, filePath?: string): Promise<string> {
  try {
    const resolvedConfig = filePath ? await prettier.resolveConfig(filePath) : null;
    const formatted = await prettier.format(source, {
      ...(resolvedConfig ?? {}),
      parser: 'typescript',
      filepath: filePath,
    });
    return formatted;
  } catch (err) {
    log.warn(
      `Prettier failed to format ${filePath ?? '<unknown>'}; writing unformatted output. ` +
        `Reason: ${(err as Error).message}`,
    );
    return source.endsWith('\n') ? source : `${source}\n`;
  }
}
