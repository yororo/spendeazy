import type { ExceptionReporter } from '../logging/exception-logger';

export const EMAIL_DELIVERY_LOGGER = Symbol('EMAIL_DELIVERY_LOGGER');
export const SAFE_EMAIL_DELIVERY_FAILURE =
  'Email delivery failed. Please retry.';

export function recordEmailDeliveryFailure(
  logger: ExceptionReporter,
  error: unknown,
): string {
  logger.report('email_delivery_failed', error);
  return SAFE_EMAIL_DELIVERY_FAILURE;
}

export function normalizeEmailDeliveryFailure(
  error: string | null,
): string | null {
  return error === null ? null : SAFE_EMAIL_DELIVERY_FAILURE;
}
