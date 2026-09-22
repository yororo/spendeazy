const SAFE_EMAIL_DELIVERY_FAILURE = 'Email delivery failed. Please retry.';

function normalizeEmailDeliveryFailure(
  error: string | null,
): string | null {
  return error === null ? null : SAFE_EMAIL_DELIVERY_FAILURE;
}

export { normalizeEmailDeliveryFailure, SAFE_EMAIL_DELIVERY_FAILURE };
