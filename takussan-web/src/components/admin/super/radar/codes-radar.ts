import type { RadarDiscardReason } from '@/types/radar';

/**
 * TCK-2386 (ADR-0077) — les codes du Radar et leur libellé.
 *
 * - {@link MOTIFS_RADAR} : les `stage_reason` qu'écrit `App\Jobs\Radar\ExtractRadarListing` —
 *   l'attente d'une annonce `captured`, ou la cause d'un `extraction_failed`. Libellés sous
 *   `superAdmin.pages.radar.reasons`.
 * - {@link ERREURS_SAISIE_RADAR} : les codes 422 de `POST /api/admin/radar/listings`. Libellés sous
 *   `superAdmin.pages.radar.intake.errors`.
 *
 * - {@link ERREURS_FICHE_RADAR} : les refus de la fiche (`PATCH`, relecture, gestes). Libellés sous
 *   `superAdmin.pages.radar.listing.errors`.
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
  // Photos source (TCK-2387) : l'image d'une annonce ne s'est pas laissée empreindre.
  // RÉSERVÉS : l'API n'écrit pas encore ces codes en `stage_reason` (ni ailleurs, côté fiche) ; leurs
  // libellés attendent qu'elle le fasse, et rien ici ne prouve qu'ils s'affichent aujourd'hui.
  'radar.fetch.not_image': 'fetchNotImage',
  'radar.photo.abandoned': 'photoAbandoned',
  'radar.photo.too_many_pixels': 'photoTooManyPixels',
  'radar.photo.unreadable': 'photoUnreadable',
  // Annonce écartée (TCK-2387) : `stage_reason` = `radar.discard.<motif>`
  'radar.discard.not_real_estate': 'discardNotRealEstate',
  'radar.discard.out_of_scope': 'discardOutOfScope',
  'radar.discard.no_longer_available': 'discardNoLongerAvailable',
  'radar.discard.unusable_source': 'discardUnusableSource',
  'radar.discard.other': 'discardOther',
};

/** Les motifs d'écart que choisit l'opérateur (`RadarDiscardReason`) : leur libellé est celui du `stage_reason` écrit. */
export const MOTIFS_ECART_RADAR: Record<RadarDiscardReason, string> = {
  not_real_estate: 'discardNotRealEstate',
  out_of_scope: 'discardOutOfScope',
  no_longer_available: 'discardNoLongerAvailable',
  unusable_source: 'discardUnusableSource',
  other: 'discardOther',
};

/**
 * Les motifs d'une attente COURTE, que le job reprend de lui-même en quelques secondes ou une
 * minute (`ExtractRadarListing`) : lecture d'URL remise à plus tard (domaine lu il y a moins de
 * 5 s), et les motifs qui n'ont droit qu'à une nouvelle tentative, 60 s plus tard
 * (`RETRY_ONCE_REASONS`). Une annonce `captured` garée sur l'un d'eux tourne encore. Pas le plafond
 * ni le coupe-circuit (30 min), ni une panne (1 à 60 min).
 */
export const MOTIFS_ATTENTE_COURTE: ReadonlySet<string> = new Set([
  'radar.fetch.deferred',
  'radar.extraction.invalid_output',
  'ai.response_invalid',
  'ai.response_truncated',
  'ai.response_filtered',
]);

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

/** Les codes 409/422 de la fiche (TCK-2387) — `radar.listing.stage_conflict` : la fiche a changé d'étape ailleurs. */
export const ERREURS_FICHE_RADAR: Record<string, string> = {
  'radar.listing.stage_conflict': 'stageConflict',
  'radar.listing.nothing_to_update': 'nothingToUpdate',
  'radar.review.incomplete': 'reviewIncomplete',
  'radar.duplicate.self': 'duplicateSelf',
  'radar.duplicate.chain': 'duplicateChain',
  'radar.advertiser.phone_invalid': 'advertiserPhoneInvalid',
  'radar.advertiser.phone_unknown': 'advertiserPhoneUnknown',
};
