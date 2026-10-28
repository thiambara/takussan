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
 * - {@link ERREURS_ANNONCEUR_RADAR} : les refus de la fiche annonceur (prise en charge, préparation, retouche,
 *   envoi — TCK-2388). Libellés sous `superAdmin.pages.radar.advertiser.errors`.
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

/**
 * Les codes 409/422 de la fiche annonceur (TCK-2388). Ils vivent dans `lang/fr/errors.php`, sous `radar.*` ;
 * `claimed_by_other` porte son paramètre `claimed_until` (l'instant, ISO), que l'écran formate.
 *
 * Il n'existe PAS de `radar.advertiser.not_claimed` : « pas la prise en charge » se dit `claim_required` (rien n'est
 * pris) ou `claim_not_held` (pris par un autre, au moment de rendre). Les motifs de vérification
 * (`radar.verification.*`, écrits par le job et non émis en réponse) sont ceux de la tâche suivante.
 */
export const ERREURS_ANNONCEUR_RADAR: Record<string, string> = {
  'radar.advertiser.claim_required': 'claimRequired',
  'radar.advertiser.claimed_by_other': 'claimedByOther',
  'radar.advertiser.claim_not_held': 'claimNotHeld',
  'radar.advertiser.do_not_contact': 'doNotContact',
  'radar.advertiser.busy': 'busy',
  'radar.outreach.locale_unsupported': 'localeUnsupported',
  'radar.outreach.listing_foreign': 'listingForeign',
  'radar.outreach.listing_not_ready': 'listingNotReady',
  'radar.outreach.listing_consented': 'listingConsented',
  'radar.outreach.listing_pending': 'listingPending',
  'radar.outreach.follow_up_invalid': 'followUpInvalid',
  'radar.outreach.follow_up_limit': 'followUpLimit',
  'radar.outreach.not_prepared': 'notPrepared',
  'radar.outreach.parts_missing': 'partsMissing',
  'radar.outreach.nothing_to_update': 'nothingToUpdate',
  'radar.outreach.not_sent': 'notSent',
  'radar.outreach.outcome_final': 'outcomeFinal',
  'radar.outreach.superseded': 'superseded',
  'radar.outreach.reply_pending': 'replyPending',
  'radar.message.generation_incomplete': 'generationIncomplete',
  // Le dépôt de réponse et la confirmation : la fiche les reçoit (`DialogueIssue`, `SuiviMessage`).
  'radar.consent.reply_required': 'replyRequired',
  'radar.consent.reason_required': 'reasonRequired',
  // Un 409 de la confirmation d'un accord ET de « J'ai envoyé » : une annonce du message a changé d'étape ailleurs.
  'radar.listing.stage_conflict': 'listingStageConflict',
};

/**
 * Les motifs que `VerifyRadarConsentReply` écrit dans `verification_reason` (`REASON_*`) — sans les codes `ai.*` de la
 * passerelle, déjà dans {@link MOTIFS_RADAR}. Libellés sous `superAdmin.pages.radar.advertiser.reply.reasons`. Une
 * attente (`pending` + motif) et un échec (`failed` + motif) se lisent par la même table ; un code inconnu s'affiche brut.
 */
export const MOTIFS_VERIFICATION_RADAR: Record<string, string> = {
  'radar.verification.error': 'error',
  'radar.verification.invalid_output': 'invalidOutput',
  'radar.verification.timeout': 'timeout',
  'radar.verification.no_capture': 'noCapture',
  'radar.verification.no_number': 'noNumber',
  'radar.verification.unexpected': 'unexpected',
};

/**
 * Ce qui, dans le verdict enregistré, ne va pas dans le sens d'un accord (`RadarConsentVerdict::discordances`) :
 * l'API en liste les codes, jamais la prose. Libellés sous `superAdmin.pages.radar.advertiser.outcome.discordances`.
 */
export const DISCORDANCES_RADAR: Record<string, string> = {
  no_verdict: 'noVerdict',
  number_mismatch: 'numberMismatch',
  clauses_missing: 'clausesMissing',
  not_consent: 'notConsent',
};
