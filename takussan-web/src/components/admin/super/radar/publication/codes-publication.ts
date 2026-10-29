/**
 * TCK-2389 (ADR-0077 §6) — les codes de « Publier pour lui » et de la réserve de photos, et leur libellé.
 *
 * Ils sortent de deux endroits de l'API : les refus (409/422 de `publish` et des gestes de la réserve) et le champ
 * `blocking` de l'aperçu, qui nomme ce qui empêche la publication AVANT que l'on essaie. Un même code a donc un même
 * libellé dans les deux cas. Libellés sous `superAdmin.pages.radar.publication.errors`.
 *
 * Les codes déjà nommés par la fiche annonceur (`radar.advertiser.do_not_contact`, `claim_required`,
 * `radar.listing.stage_conflict`…) restent dans {@link ERREURS_ANNONCEUR_RADAR}.
 *
 * Un code absent d'ici s'affiche brut, jamais masqué.
 */
export const ERREURS_PUBLICATION_RADAR: Record<string, string> = {
  // `RadarPublisher::publish()` et son aperçu
  'radar.publish.listing_foreign': 'listingForeign',
  'radar.publish.not_covered': 'notCovered',
  'radar.publish.photos_pending': 'photosPending',
  'radar.publish.no_photo': 'noPhoto',
  'radar.publish.missing_field': 'missingField',
  'radar.publish.too_many_photos': 'tooManyPhotos',
  'radar.publish.nothing_covered': 'nothingCovered',
  'radar.publish.nothing_published': 'nothingPublished',
  // `AdvertiserProvisioner`
  'radar.advertiser.phone_registered': 'phoneRegistered',
  'radar.advertiser.account_unavailable': 'accountUnavailable',
  // `RadarPhotoReserve` : relance, dépôt, retrait
  'radar.listing.no_source_photos': 'noSourcePhotos',
  'radar.photo.not_found': 'photoNotFound',
  'radar.photo.reserve_full': 'reserveFull',
  'radar.photo.too_large': 'photoTooLarge',
  'radar.photo.unreadable': 'photoUnreadable',
  // Le quota de l'espace de l'annonceur, jugé avant chaque bien ; l'intergiciel d'idempotence (ADR-0072)
  'quota.listings_exceeded': 'quotaExceeded',
  'idempotency.key_reused': 'keyReused',
  'idempotency.in_progress': 'inProgress',
};

/**
 * Les codes que `blocking` (annonce ou ensemble) peut porter, et que l'écran range : ce qui se corrige sur l'écran
 * (photos, champs) et ce qui ferme tout (compte, STOP, rien de couvert).
 */
export const BLOCAGES_GLOBAUX_RADAR: ReadonlySet<string> = new Set([
  'radar.advertiser.phone_registered',
  'radar.advertiser.account_unavailable',
  'radar.advertiser.do_not_contact',
  'radar.publish.nothing_covered',
]);
