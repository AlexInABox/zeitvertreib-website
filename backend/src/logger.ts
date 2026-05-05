import * as Sentry from '@sentry/cloudflare';

export function logInfo(message: string) {
  Sentry.logger.info(message);
}
