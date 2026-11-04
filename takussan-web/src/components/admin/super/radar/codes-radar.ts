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
  // TCK-2467 — un sitemap lu par `UrlFetcher::fetchXml()` qui n'est pas du XML.
  'radar.fetch.not_xml': 'fetchNotXml',
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
  // Fusion automatique (TCK-2392) : `stage_reason` d'un doublon que la collecte a fusionné d'office.
  'radar.merge.auto': 'mergeAuto',
  // Annonce réclamée que la publication automatique laisse à l'opérateur (TCK-2413, `PublishClaimedRadarListings`) : la
  // raison, ou le code du refus de la publication (`RadarPublisher::publishClaimed()`). Un code qu'aucune ligne ne nomme
  // s'affiche par le repli `claimLeftRefused` ({@link MOTIF_LAISSEE_REPLI}), jamais brut.
  'radar.publish.no_photo': 'claimLeftNoPhoto',
  'radar.publish.missing_field': 'claimLeftMissingField',
  'radar.publish.photos_pending': 'claimLeftPhotosPending',
  'radar.claim.publish_failed': 'claimLeftFailed',
  // TCK-2461 — l'annonceur a refusé ou contesté depuis sa page de réclamation : s'affichait brut dans la liste.
  'radar.claim.declined': 'claimDeclined',
  'radar.advertiser.account_unavailable': 'claimLeftAccountUnavailable',
  'quota.listings_exceeded': 'claimLeftQuota',
  'radar.listing.stage_conflict': 'claimLeftStageConflict',
  'radar.publish.not_covered': 'claimLeftNotCovered',
  'radar.claim.account_changed': 'claimLeftAccountChanged',
  'radar.publish.listing_foreign': 'claimLeftForeign',
  'radar.claim.under_mandate': 'claimLeftUnderMandate',
  'radar.advertiser.do_not_contact': 'claimLeftDoNotContact',
  'radar.publish.activation_unavailable': 'claimLeftActivationUnavailable',
  'radar.publish.otp_preview_active': 'claimLeftOtpPreview',
  'radar.publish.too_many_photos': 'claimLeftTooManyPhotos',
};

/** TCK-2413 — le libellé d'une annonce laissée par la publication sur un code qu'aucune ligne de {@link MOTIFS_RADAR} ne nomme. */
export const MOTIF_LAISSEE_REPLI = 'claimLeftRefused';

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
  // TCK-2392 — « Séparer » sur un doublon posé à la main.
  'radar.merge.not_automatic': 'mergeNotAutomatic',
};

/**
 * Les codes 409/422 de la fiche annonceur (TCK-2388). Ils vivent dans `lang/fr/errors.php`, sous `radar.*` ;
 * `claimed_by_other` porte son paramètre `claimed_until` (l'instant, ISO), que l'écran formate.
 *
 * Il n'existe PAS de `radar.advertiser.not_claimed` : « pas la prise en charge » se dit `claim_required` (rien n'est
 * pris) ou `claim_not_held` (pris par un autre, au moment de rendre). Les motifs de vérification
 * (`radar.verification.*`, écrits par le job et non émis en réponse) sont dans `MOTIFS_VERIFICATION_RADAR`.
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
  // L'envoi par l'API du numéro du Radar (TCK-2395) : « Envoyer par l'API » de la fiche (TCK-2426).
  'radar.whatsapp.not_configured': 'whatsappNotConfigured',
  'radar.whatsapp.same_number': 'whatsappSameNumber',
  'radar.whatsapp.template_missing': 'whatsappTemplateMissing',
  'radar.whatsapp.message_mismatch': 'whatsappMessageMismatch',
  'radar.whatsapp.summary_too_long': 'whatsappSummaryTooLong',
  'radar.whatsapp.send_failed': 'whatsappSendFailed',
  'radar.message.generation_incomplete': 'generationIncomplete',
  // Le dépôt de réponse et la confirmation : la fiche les reçoit (`DialogueIssue`, `SuiviMessage`).
  'radar.consent.reply_required': 'replyRequired',
  'radar.consent.reason_required': 'reasonRequired',
  // Un 409 de la confirmation d'un accord ET de « J'ai envoyé » : une annonce du message a changé d'étape ailleurs.
  'radar.listing.stage_conflict': 'listingStageConflict',
  // TCK-2413 — délier le compte supprimé : le compte rattaché ne l'est pas (un STOP rend `do_not_contact`, déjà nommé).
  'radar.advertiser.account_not_deleted': 'accountNotDeleted',
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
  'radar.verification.purged': 'purged',
  // TCK-2395 — une réponse reçue par l'API sans texte (vocal, image) : rien à vérifier, l'opérateur tranche.
  'radar.verification.no_text': 'noText',
};

/**
 * Ce qui, dans le verdict enregistré, ne va pas dans le sens d'un accord (`RadarConsentVerdict::discordances`) :
 * l'API en liste les codes, jamais la prose. Libellés sous `superAdmin.pages.radar.advertiser.outcome.discordances`.
 */
export const DISCORDANCES_RADAR: Record<string, string> = {
  no_verdict: 'noVerdict',
  number_mismatch: 'numberMismatch',
  identity_unverified: 'identityUnverified',
  clauses_missing: 'clausesMissing',
  not_consent: 'notConsent',
};

/** TCK-2392 — les refus de l'onglet Collecte. Libellés sous `superAdmin.pages.radar.crawl.errors`. */
export const ERREURS_COLLECTE_RADAR: Record<string, string> = {
  'radar.crawl.active': 'active',
  'radar.crawl.unknown_site': 'unknownSite',
  // TCK-2438 — les URL de départ refusées ; `params.field` (`start_urls.N`) nomme laquelle.
  'radar.crawl.start_urls_too_many': 'startUrlsTooMany',
  'radar.crawl.start_url_too_long': 'startUrlTooLong',
  'radar.crawl.start_url_invalid': 'startUrlInvalid',
  'radar.crawl.start_url_host': 'startUrlHost',
  'radar.crawl.start_url_duplicate': 'startUrlDuplicate',
  // TCK-2467 — `discovery: sitemap` sur un site dont l'adaptateur ne déclare aucun sitemap.
  'radar.crawl.discovery_unavailable': 'discoveryUnavailable',
};

/**
 * TCK-2392 — pourquoi un passage s'est arrêté (`stop_reason`, `RadarCrawlRun::STOP_*`, `RadarCrawler`, `RadarCrawlScheduler`).
 * Libellés sous `superAdmin.pages.radar.crawl.stops`. Un refus de lecture (`radar.fetch.*`) se lit par {@link MOTIFS_RADAR}.
 */
export const ARRETS_COLLECTE_RADAR: Record<string, string> = {
  'radar.crawl.end': 'end',
  'radar.crawl.max_pages': 'maxPages',
  'radar.crawl.no_cards': 'noCards',
  'radar.crawl.domain_busy': 'domainBusy',
  'radar.crawl.time_budget': 'timeBudget',
  'radar.crawl.no_operator': 'noOperator',
  'radar.crawl.error': 'error',
  'radar.crawl.lost': 'lost',
  'radar.crawl.loop': 'loop',
  'radar.crawl.no_start_url': 'noStartUrl',
  // TCK-2467 — un sitemap illisible coupe la lecture (le passage ne déclare rien disparu).
  'radar.crawl.sitemap_invalid': 'sitemapInvalid',
};

/**
 * TCK-2469 — les refus des cibles (TCK-2468, `RadarTargetCriteria`, `RadarTargets`). Libellés sous
 * `superAdmin.pages.radar.targets.errors` ; `params.field` (`criteria.<clé>…`) nomme le critère, `params.max` la borne,
 * `params.target_id` la cible qui porte déjà ces critères.
 */
export const ERREURS_CIBLES_RADAR: Record<string, string> = {
  'radar.targets.empty_criteria': 'emptyCriteria',
  'radar.targets.unknown_criterion': 'unknownCriterion',
  'radar.targets.invalid_criteria': 'invalidCriteria',
  'radar.targets.too_many_items': 'tooManyItems',
  'radar.targets.invalid_range': 'invalidRange',
  'radar.targets.duplicate': 'duplicate',
  'radar.targets.too_many': 'tooMany',
  // Décision 2a (2026-11-04) — une cible retirée ne se modifie plus (`PATCH` refusé, `params.target_id`).
  'radar.targets.retired': 'retired',
};

/**
 * TCK-2470 — ce qui empêche un passage des cibles de la demande (`blocked_reason`, et le 409 de « rafraîchir
 * maintenant »). Libellés sous `superAdmin.pages.radar.targets.demand.blocked`.
 */
export const BLOCAGES_DEMANDE_RADAR: Record<string, string> = {
  'radar.demand.disabled': 'disabled',
  'radar.demand.operator_missing': 'operatorMissing',
};

/**
 * TCK-2470 — l'issue du dernier passage (`last_run_outcome`). Libellés sous
 * `superAdmin.pages.radar.targets.demand.outcomes` ; un refus de la passerelle (`ai.*`) se lit par {@link MOTIFS_RADAR},
 * et un code qu'aucune table ne nomme par le repli `other`, jamais brut.
 */
export const ISSUES_DEMANDE_RADAR: Record<string, string> = {
  applied: 'applied',
  unchanged: 'unchanged',
  no_signals: 'noSignals',
  // Revue du 2026-11-04 (D7) — aucun signal : les cibles tirées de la demande ont été retirées, sans IA.
  no_signals_retired: 'noSignalsRetired',
  'radar.demand.disabled': 'disabled',
  'radar.demand.operator_missing': 'operatorMissing',
  'radar.demand.invalid_output': 'invalidOutput',
};

/**
 * TCK-2470 — pourquoi le code a écarté une opération proposée par l'IA (`discarded[].code`, `RadarDemandCurator`).
 * Libellés sous `superAdmin.pages.radar.targets.revisions.discardReasons` ; repli `other`, jamais le code brut.
 */
export const ECARTS_DEMANDE_RADAR: Record<string, string> = {
  'radar.demand.target_protected': 'targetProtected',
  'radar.demand.unknown_target': 'unknownTarget',
  'radar.demand.too_many': 'tooManyDemand',
  'radar.demand.invalid_operation': 'invalidOperation',
  'radar.demand.invalid_name': 'invalidName',
  // Revue du 2026-11-04 (D3) — les critères ne couvrent aucun des signaux que l'opération cite.
  'radar.demand.uncovered': 'uncovered',
  'radar.targets.invalid_criteria': 'invalidCriteria',
  'radar.targets.unknown_criterion': 'unknownCriterion',
  'radar.targets.too_many_items': 'tooManyItems',
  'radar.targets.invalid_range': 'invalidRange',
  'radar.targets.empty_criteria': 'emptyCriteria',
  'radar.targets.duplicate': 'duplicate',
  'radar.targets.too_many': 'tooMany',
  'radar.targets.retired': 'retired',
};

/**
 * Revue du 2026-11-04 (D7) — le motif d'une opération que le CODE a faite seul, sans IA (`operations[].reason`,
 * `RadarDemandCurator::REASON_*`). Libellés sous `superAdmin.pages.radar.targets.revisions.codeReasons` ; tout autre motif
 * est celui que l'IA a écrit, cité tel quel.
 */
export const MOTIFS_REVISION_RADAR: Record<string, string> = {
  'radar.demand.no_demand': 'noDemand',
};
