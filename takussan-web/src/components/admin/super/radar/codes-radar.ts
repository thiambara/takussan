/**
 * TCK-2386 (ADR-0077) — les codes du Radar et leur libellé.
 *
 * - {@link MOTIFS_RADAR} : les `stage_reason` qu'écrit `App\Jobs\Radar\ExtractRadarListing` —
 *   l'attente d'une annonce `captured`, ou la cause d'un `extraction_failed`. Libellés sous
 *   `superAdmin.pages.radar.reasons`.
 * - {@link ERREURS_SAISIE_RADAR} : les codes 422 de `POST /api/admin/radar/listings`. Libellés sous
 *   `superAdmin.pages.radar.intake.errors`.
 *
 * Un code absent d'ici s'affiche brut, jamais masqué.
 */
export const MOTIFS_RADAR: Record<string, string> = {
  // Lecture d'URL
  'radar.fetch.deferred': 'fetchDeferred',
  'radar.fetch.invalid_url': 'fetchInvalidUrl',
  'radar.fetch.airbnb': 'fetchAirbnb',
  'radar.fetch.private_address': 'fetchPrivateAddress',
  'radar.fetch.robots': 'fetchRobots',
  'radar.fetch.robots_unavailable': 'fetchRobotsUnavailable',
  'radar.fetch.too_many_redirects': 'fetchTooManyRedirects',
  'radar.fetch.too_large': 'fetchTooLarge',
  'radar.fetch.not_html': 'fetchNotHtml',
  'radar.fetch.http_error': 'fetchHttpError',
  'radar.fetch.timeout': 'fetchTimeout',
  'radar.fetch.unresolvable': 'fetchUnresolvable',
  // Passerelle IA : refus et pauses
  'ai.budget': 'aiBudget',
  'ai.kill_switch': 'aiKillSwitch',
  'ai.forbidden': 'aiForbidden',
  'ai.data_class': 'aiDataClass',
  'ai.sensitive_data': 'aiSensitiveData',
  'ai.role_unassigned': 'aiRoleUnassigned',
  'ai.providers_unavailable': 'aiProvidersUnavailable',
  // Passerelle IA : erreurs d'appel (`AiErrorCode`)
  'ai.provider_auth': 'aiProviderAuth',
  'ai.request_rejected': 'aiRequestRejected',
  'ai.provider_rate_limited': 'aiProviderRateLimited',
  'ai.provider_credits': 'aiProviderCredits',
  'ai.provider_unavailable': 'aiProviderUnavailable',
  'ai.provider_timeout': 'aiProviderTimeout',
  'ai.response_invalid': 'aiResponseInvalid',
  'ai.response_truncated': 'aiResponseTruncated',
  'ai.response_filtered': 'aiResponseFiltered',
  'ai.unexpected': 'aiUnexpected',
  // Extraction
  'radar.extraction.invalid_output': 'extractionInvalidOutput',
  'radar.extraction.empty_source': 'extractionEmptySource',
  'radar.extraction.timeout': 'extractionTimeout',
  'radar.extraction.error': 'extractionError',
};

/**
 * Une URL que le serveur n'a pas pu lire : le texte collé ou des captures d'écran prennent le
 * relais. Pas pour Airbnb, refusé par principe (ADR-0077), ni pour une lecture remise à plus tard.
 */
export function suggereTexteOuCaptures(code: string | null): boolean {
  return code !== null
    && code.startsWith('radar.fetch.')
    && code !== 'radar.fetch.airbnb'
    && code !== 'radar.fetch.deferred';
}

export const ERREURS_SAISIE_RADAR: Record<string, string> = {
  'radar.url.airbnb': 'urlAirbnb',
  'radar.url.invalid': 'urlInvalid',
  'radar.captures.unreadable': 'capturesUnreadable',
  'radar.captures.too_large': 'capturesTooLarge',
};
