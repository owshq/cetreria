const SIGNATURE_DATA_URL_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const MAX_SIGNATURE_CHARS = 120_000;

export function isValidUserSignatureDataUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_SIGNATURE_CHARS) return false;
  return SIGNATURE_DATA_URL_RE.test(trimmed);
}

export function normalizeUserSignatureInput(
  value: unknown,
): string | undefined | null {
  if (value === null) return null;
  if (value === undefined) return undefined;
  if (!isValidUserSignatureDataUrl(value)) return undefined;
  return value.trim();
}
