/**
 * TCK-2399 — les codes `ai.*` qu'écrit `App\Services\Ai\AiErrorCode` quand un appel au modèle
 * échoue : test de connexion d'un fournisseur et évaluation d'un candidat. Libellés sous
 * `superAdmin.pages.ai.callErrors`. Un code absent d'ici s'affiche brut, jamais masqué.
 */
export const ERREURS_APPEL_IA: Record<string, string> = {
  'ai.provider_timeout': 'providerTimeout',
  'ai.provider_rate_limited': 'providerRateLimited',
  'ai.provider_credits': 'providerCredits',
  'ai.provider_unavailable': 'providerUnavailable',
  'ai.provider_auth': 'providerAuth',
  'ai.request_rejected': 'requestRejected',
  'ai.response_invalid': 'responseInvalid',
  'ai.response_truncated': 'responseTruncated',
  'ai.response_filtered': 'responseFiltered',
  'ai.unexpected': 'unexpected',
};
