import type { UserRole } from '@/types/user';

/**
 * TCK-2477 (ADR-0089) — les types du menu de `/app`, sortis d'`AppSidebar.tsx` avec leurs docblocks.
 * `AppSidebar` les ré-exporte pour ses appelants d'avant.
 */

/**
 * TCK-377 — Les sections se lisent dans l'ordre où le métier arrive, pas dans celui de
 * l'inventaire technique : ce qu'on ouvre à chaque fois → ce qu'on cherche → ce qu'on demande →
 * ce à quoi on s'est engagé → ce qu'on pilote → l'administration.
 *
 * TCK-649 (ADR-0064 §2) — `admin` est la section d'agence : une entrée par page de la table des
 * pages que le profil actif peut ouvrir (`avecSectionAgence`, `AppSidebar.tsx`), titrée « Administration », ou
 * « Mon espace » chez l'admin d'une agence `individual`.
 *
 * TCK-646 — la section `catalog` (« Mes biens », « Publier un bien ») n'existe plus : ses entrées
 * sont montées en tête, dans `primary` (la tête des dispositions, `dispositions.ts`). Gardée, elle serait restée vide
 * pour tous les rôles.
 *
 * `primary` n'a **pas** de libellé, et ce n'est pas un oubli : une césure placée avant la
 * première entrée ne coupe rien. C'est la DONNÉE qui le dit ({@link SECTION_LABEL_KEYS}), pas un
 * test sur le nom de la section dans le rendu — sinon la règle vit dans le composant et se perd
 * à la première section ajoutée.
 *
 * TCK-2477 (ADR-0089 §4) — `plus` : les destinations accessibles qu'aucune disposition ne place.
 * Elle ferme la marche : une destination n'est jamais PERDUE, elle tombe ici.
 */
export type NavSection =
  | 'primary'
  | 'discover'
  | 'requests'
  | 'engagements'
  | 'manage'
  | 'admin'
  | 'plus';

export const SECTION_ORDER: readonly NavSection[] = [
  'primary',
  'discover',
  'requests',
  'engagements',
  'manage',
  'admin',
  'plus',
];

/** `null` = section rendue SANS en-tête. Clés sous `nav.sidebar.sections`. */
export const SECTION_LABEL_KEYS: Record<NavSection, string | null> = {
  primary: null,
  discover: 'discover',
  requests: 'requests',
  engagements: 'engagements',
  manage: 'manage',
  admin: 'admin',
  plus: 'more',
};

/**
 * Clé du compteur porté par une entrée. Le rendu la résout, la donnée ne connaît aucun nombre.
 *
 * TCK-649 — les deux files de modération de la section d'agence (`reviewModeration`,
 * `propertyModeration`) : le badge de TCK-098, que portait la barre de l'ancienne console.
 */
export type NavCounterKey =
  | 'unreadMessages'
  | 'pendingVisits'
  | 'unhandledLeads'
  | 'reviewModeration'
  | 'propertyModeration';

/**
 * Ce que le catalogue sait du compte pour juger une destination : les rôles de l'espace actif
 * (ADR-0005 amendé) et les capacités du profil actif — `null` tant qu'elles ne sont pas lues
 * (P152.03 : le personnel n'a alors aucune entrée de création).
 */
export interface ContexteDeMenu {
  readonly roles: UserRole[];
  readonly capacites: readonly string[] | null;
  /** TCK-2478 — les pages d'administration que le profil actif peut ouvrir (`AccesAdmin.chemins`). */
  readonly cheminsAdmin?: readonly string[];
  /** TCK-2478 — l'agence du profil actif est suspendue (TCK-600) : aucune écriture au menu. */
  readonly agenceSuspendue?: boolean;
}
