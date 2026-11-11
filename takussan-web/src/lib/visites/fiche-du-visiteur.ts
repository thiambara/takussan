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
 * carte du visiteur (`visitor_display`), et d'elle SEULE. L'API ne la sert qu'au personnel de
 * l'agence du bien, au propriétaire d'un bien sans agence et au super-admin
 * (`PropertyVisitResource::outilDeLaConsole()`) — exactement ceux qui peuvent en faire une fiche.
 * `undefined` quand la visite a déjà une fiche, que la carte n'est pas servie à ce lecteur, ou
 * qu'elle ne porte ni nom ni numéro.
 *
 * ⚠ Aucun repli sur `visitor_name` / `visitor_phone` : quand la carte est nulle, le lecteur n'est
 * pas de la console de ce bien (contre-vérification du 2026-11-11). Le seul à atteindre ce
 * formulaire sans elle est le compte à double casquette — personnel d'une agence B, bailleur d'un
 * bien de l'agence A —, et le repli lui faisait écrire le prospect de A dans le CRM de B.
 *
 * ⚠ Ces valeurs ne transitent JAMAIS par l'URL : `/app/customers/new?visite=<id>` relit la visite au
 * serveur. Un numéro dans l'URL part dans l'historique, les journaux et l'en-tête `Referer`.
 */
export function ficheDuVisiteur(
  visite: Pick<PropertyVisit, 'customer' | 'visitor_display'>,
): FicheDuVisiteur | undefined {
  const carte = visite.visitor_display;
  if (visite.customer || !carte) return undefined;
  const nom = propre(carte.name);
  const [prenom, ...reste] = nom?.split(/\s+/) ?? [];
  const fiche = {
    first_name: propre(prenom),
    last_name: propre(reste.join(' ')),
    phone: propre(carte.phone),
  };
  return Object.values(fiche).some(Boolean) ? fiche : undefined;
}
