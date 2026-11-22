import type { PropertyDetail } from '@/types/property';

/**
 * TCK-2602 — ce que l'écran « Votre annonce est en ligne » (`/app/properties/{id}/en-ligne`) dit d'un
 * bien. Hors du `page.tsx` : Next refuse qu'une page exporte autre chose que ses exports de route.
 */

/** `en-ligne` : public et visible ; `verification` : en attente de modération (`pending_review`). */
export type EtatDeLAnnonce = 'en-ligne' | 'verification';

/** Les statuts d'une annonce visible du public (`PropertyHeaderActions`, `PUBLIC_VIEWABLE_STATUSES`). */
const STATUTS_PUBLICS: ReadonlySet<string> = new Set(['available', 'published']);

/**
 * L'état que l'écran dit, ou `null` : l'écran ne sert que l'annonce qu'un espace PARTICULIER vient de
 * publier (TCK-2602). Un bien d'agence `standard`, un brouillon, un bien loué : la fiche, comme avant.
 */
export function etatDeLAnnonce(bien: Pick<PropertyDetail, 'status' | 'visibility' | 'slug' | 'agency'>): EtatDeLAnnonce | null {
  if (bien.agency?.kind !== 'individual') return null;
  if (bien.status === 'pending_review') return 'verification';
  if (bien.visibility === 'public' && bien.slug && bien.status && STATUTS_PUBLICS.has(bien.status)) return 'en-ligne';
  return null;
}

