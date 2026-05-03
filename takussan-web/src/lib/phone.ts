/**
 * E.164 phone helpers — kept tiny and dependency-free.
 *
 * Strict E.164: leading "+", country code in [1-9], 7 to 15 total digits.
 * Senegalese mobiles match `^\+221[37]\d{8}$`, but this helper stays
 * country-agnostic so the same form works for the diaspora.
 *
 * The backend (`UpdateProfileRequest::rules`) enforces the same regex —
 * client validation is purely UX (live error feedback).
 */

const E164_REGEX = /^\+[1-9]\d{6,14}$/;

export function isE164(value: string): boolean {
  return E164_REGEX.test(value);
}

/**
 * Normalises a user-typed phone string by stripping spaces, parens and dashes,
 * leaving only the leading `+` and digits. Does NOT validate — pair with
 * `isE164` after normalisation if you need both.
 */
export function normalizePhoneInput(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return '';
  return trimmed.replace(/[\s()\-.]/g, '');
}
