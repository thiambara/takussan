/**
 * TCK-2390 — les codes que la page publique de réclamation (`/api/radar/claims/{jeton}`) reçoit, et la clé de leur
 * libellé sous `radarClaim.errors`. Les quatre premiers ne sont pas des messages mais des ÉTATS de la page (le lien ne
 * sert pas, ou plus) : `RadarClaimReception` les rend en page entière ; leur clé est celle de la description de cet état.
 *
 * Les refus de la connexion par téléphone que la confirmation relaie (`phone_code_invalid`, `account_locked`,
 * `account_blocked`) sont à part, dans {@link REFUS_DU_CODE} : ce ne sont pas des codes `radar.*`.
 */
export const ERREURS_RECLAMATION_RADAR: Readonly<Record<string, string>> = {
  'radar.claim.invalid': 'invalid',
  'radar.claim.expired': 'expired',
  'radar.claim.revoked': 'revoked',
  'radar.claim.unavailable': 'unavailable',
  'radar.claim.account_unavailable': 'accountUnavailable',
  'radar.claim.terms_outdated': 'termsOutdated',
  'radar.claim.listing_unavailable': 'listingUnavailable',
  'radar.claim.nothing_selected': 'nothingSelected',
  'radar.claim.login_required': 'loginRequired',
  'radar.claim.wrong_account': 'wrongAccount',
  'radar.claim.account_changed': 'accountChanged',
  'radar.claim.support_required': 'supportRequired',
};

export const REFUS_DU_CODE: Readonly<Record<string, string>> = {
  phone_code_invalid: 'codeInvalid',
  account_locked: 'locked',
  account_blocked: 'accountUnavailable',
};
