import type { ContractType } from '@/types/property';

/**
 * Ce que le domaine des lieux partage SANS dépendre des schémas (TCK-2495, revue adverse) :
 * `facettes.ts` tire `canonique.ts`, donc `lib/schemas` et zod. L'accueil (`HomepageDiscovery`,
 * client) n'a besoin que de ces trois valeurs : les importer de `facettes.ts` faisait entrer zod
 * dans le JS de la page la plus vue (`zod-hors-des-pages-publiques.test.ts`).
 *
 * `facettes.ts` les réexporte : ses appelants n'ont pas changé.
 */

/** P35.05 — le compte de la ville par contrat ; l'API sert les deux, zéro compris. */
export type ComptesParContrat = Readonly<Partial<Record<ContractType, number>>>;

/**
 * Fraîcheur du domaine. Une ville entre ou sort du catalogue au rythme des annonces, pas des
 * déploiements — et l'appel se fait dans la `generateMetadata` de la page publique la plus
 * parcourue. `revalidate` partage donc une seule réponse entre tous les visiteurs d'une heure,
 * là où le défaut de `fetch` sous Next 16 (`no-store`) en ferait un aller-retour par rendu.
 */
export const FRAICHEUR_DOMAINE_VILLES = 3600;

/** La graphie de repli d'une ville ou d'un quartier — la même que `villesDuCatalogue`. */
export function replie(valeur: string): string {
  return valeur.trim().toLocaleLowerCase('fr');
}
