import { type DomainesDeFacette, cheminCanoniqueDeLaListe } from './canonique';
import type { PropertyDetail } from '@/types/property';

/**
 * Le chemin du maillon de quartier, ou `undefined` s'il doit rester un libellé.
 *
 * ⚠ Ce module n'est importé que par la `page.tsx` (serveur) : `canonique` tire `@/lib/schemas/property`,
 * donc zod, et le fil d'Ariane est aussi rendu par un composant client (`PropertyBreadcrumb`).
 * Le garder hors de `fil-d-ariane.ts` tient zod hors du graphe client de la fiche (TCK-744).
 *
 * Fonction PURE : la page lui passe les domaines (`domainesDeLaListe` sur `{ city, location }`).
 * Le chemin n'est rendu que si la canonique RETIENT le quartier — ville du catalogue, quartier
 * dans son domaine indexable, seuil compris. Domaine inconnaissable, quartier trop mince ou bien
 * sans ville : pas de lien, plutôt qu'un lien que la page pointée désavouerait.
 */
export function hrefDuQuartier(
  property: PropertyDetail,
  domaines: DomainesDeFacette,
): string | undefined {
  const { city, quarter } = property.location;
  if (!city || !quarter) return undefined;

  const chemin = cheminCanoniqueDeLaListe(new URLSearchParams({ city, location: quarter }), domaines);
  const [, requete = ''] = chemin.split('?');
  return new URLSearchParams(requete).has('location') ? chemin : undefined;
}

/**
 * P35.05 — le chemin du maillon de VILLE : la canonique contrat × ville (« Louer › Dakar » mène aux
 * locations de Dakar), ou `null` si la ville n'y est pas retenue — sous `SEUIL_VILLE_INDEXABLE`,
 * ou domaine inconnaissable. Même règle que le quartier : pas de lien que la page pointée
 * désavouerait. `undefined` pour un bien sans ville (pas de maillon).
 */
export function hrefDeLaVille(
  property: PropertyDetail,
  domaines: DomainesDeFacette,
): string | null | undefined {
  const { city } = property.location;
  if (!city) return undefined;

  const chemin = cheminCanoniqueDeLaListe(
    new URLSearchParams({ contract_type: property.contract_type, city }),
    domaines,
  );
  const [, requete = ''] = chemin.split('?');
  return new URLSearchParams(requete).has('city') ? chemin : null;
}
