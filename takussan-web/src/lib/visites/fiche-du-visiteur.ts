import type { PropertyVisit } from '@/types/visit';

/** Ce que « Créer sa fiche » pose dans le formulaire de création (`CustomerForm`, `initial`). */
export interface FicheDuVisiteur {
  readonly first_name?: string;
  readonly last_name?: string;
  readonly phone?: string;
}

function propre(v: string | null | undefined): string | undefined {
  const s = v?.trim();
  return s ? s.slice(0, 120) : undefined;
}

/**
 * TCK-2581 — la fiche d'un visiteur qui n'en a pas, tirée de SA visite : le nom et le numéro de la
 * carte du visiteur (`visitor_display`, servie au seul personnel de l'agence du bien), à défaut ceux
 * qu'il a saisis. `undefined` quand la visite a déjà une fiche, ou ne porte ni nom ni numéro.
 *
 * ⚠ Ces valeurs ne transitent JAMAIS par l'URL : `/app/customers/new?visite=<id>` relit la visite au
 * serveur. Un numéro dans l'URL part dans l'historique, les journaux et l'en-tête `Referer`.
 */
export function ficheDuVisiteur(
  visite: Pick<PropertyVisit, 'customer' | 'visitor_name' | 'visitor_phone' | 'visitor_display'>,
): FicheDuVisiteur | undefined {
  if (visite.customer) return undefined;
  const nom = propre(visite.visitor_display?.name ?? visite.visitor_name);
  const [prenom, ...reste] = nom?.split(/\s+/) ?? [];
  const fiche = {
    first_name: propre(prenom),
    last_name: propre(reste.join(' ')),
    phone: propre(visite.visitor_display?.phone ?? visite.visitor_phone),
  };
  return Object.values(fiche).some(Boolean) ? fiche : undefined;
}
