import type { RadarAdvertiserListing, RadarOutreach } from '@/types/radar';

/** Pourquoi une annonce ne se coche pas — la clé de `superAdmin.pages.radar.advertiser.listings.why`. */
export type RaisonNonCochable = 'covered' | 'notReviewed' | 'closed' | 'pending';

/**
 * TCK-2388 — une annonce se coche pour un PREMIER message si elle est relue (`reviewed`), ou déjà contactée
 * sans message ouvert (`RadarOutreachWorkflow::judgeListings`). Le front ne décide de rien : il évite le 422
 * évident ; l'API juge de nouveau, et son refus s'affiche par son code.
 *
 * Un message OUVERT est un message envoyé sans issue, dernier de sa chaîne : l'API le marque par `follow_up`
 * (`RadarOutreachResource`). Une annonce couverte par un accord valide ne se démarche plus.
 */
export function raisonNonCochable(
  annonce: RadarAdvertiserListing,
  messages: readonly RadarOutreach[],
): RaisonNonCochable | null {
  if (annonce.covered_by_consent || annonce.stage === 'consented') return 'covered';
  switch (annonce.stage) {
    case 'reviewed':
      return null;
    case 'contacted':
      return messages.some((m) => m.follow_up !== null && m.listing_ids.includes(annonce.id)) ? 'pending' : null;
    case 'captured':
    case 'extracted':
    case 'extraction_failed':
      return 'notReviewed';
    default:
      return 'closed';
  }
}
