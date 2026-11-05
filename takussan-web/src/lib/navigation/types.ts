import type { UserRole } from '@/types/user';

/**
 * TCK-2477 (ADR-0089) — les types du menu de `/app`, sortis d'`AppSidebar.tsx` avec leurs docblocks.
 *
 * TCK-2478 — `NavSection`, `SECTION_ORDER` et `SECTION_LABEL_KEYS` ont disparu : le menu n'a plus
 * de sections communes à tous les rôles, mais les groupes de la disposition du persona
 * (`dispositions.ts`), rendus par `composerMenu` (`composer-menu.ts`).
 */

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
