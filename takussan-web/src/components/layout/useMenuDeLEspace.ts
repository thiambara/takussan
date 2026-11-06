'use client';

import type { User } from '@/types/user';
import type { ProfileType } from '@/types/profile';
import { isAgent, isAdmin, isSuperAdmin } from '@/lib/roles';
import { useMyCapabilities } from '@/hooks/useCan';
import { isProRouteLocked } from '@/lib/access/pro-features';
import { useAccesAdminOuRepli } from '@/lib/access/acces-admin-contexte';
import {
  composerMenu,
  type EntreeComposee,
  type GroupeCompose,
  type MenuCompose,
} from '@/lib/navigation/composer-menu';
import { personaDeLaCoque, type Persona } from '@/lib/navigation/personas';
import { prefsDe } from '@/lib/navigation/preferences';
import type { ContexteDeMenu } from '@/lib/navigation/types';
import { usePreferencesDuMenu } from './PreferencesDuMenu';

/**
 * Une entrée rendue : celle du menu composé, plus le cadenas de l'agence `individual`.
 *
 * Une entrée porte une CLÉ de libellé, pas un libellé. `composerMenu` (`@/lib/navigation/composer-menu`)
 * est une fonction pure appelée hors composant : `useTranslations` n'y est pas appelable, et l'y
 * rendre appelable voudrait dire la transformer en hook — donc la rendre intestable. Le patron
 * retenu est celui que TCK-286 applique partout où le texte naît loin de l'écran : **la donnée
 * transporte la clé, le rendu la résout**.
 */
export type EntreeRendue = EntreeComposee & { readonly locked?: boolean };
/** `Omit` et non une intersection : sur `GroupeCompose & …`, `entrees` reste typé `EntreeComposee` à la lecture. */
export type GroupeRendu = Omit<GroupeCompose, 'entrees'> & { readonly entrees: readonly EntreeRendue[] };

export interface ParametresDuMenu {
  readonly user: User;
  readonly agencyIsStandard?: boolean;
  readonly typeProfilActif?: ProfileType | null;
  readonly agencySuspended?: boolean;
}

export interface MenuDeLEspace {
  readonly persona: Persona;
  /** Le contexte qui a jugé les destinations : relu par « Démarrer » (`cheminOuvert`). */
  readonly ctx: ContexteDeMenu;
  /** Le menu RENDU : préférences du compte comprises (TCK-2480). */
  readonly menu: MenuCompose;
  readonly groupes: readonly GroupeRendu[];
  /** Toutes les entrées rendues, à plat : ce que sonde `useCompteursDuMenu`, ce qu'allume `resolveActiveHref`. */
  readonly entrees: readonly EntreeRendue[];
  /**
   * Les groupes de la DISPOSITION seule, sans préférences, cadenas compris : la source des onglets
   * mobiles (TCK-2481, arbitrage 6). Sur le menu rendu, le remplacement d'un onglet absent
   * commencerait par les épingles de l'utilisateur, et ne serait plus « la destination suivante de
   * sa disposition ». Mêmes destinations que `groupes`, autrement rangées.
   */
  readonly groupesDeLaDisposition: readonly GroupeRendu[];
}

/**
 * TCK-2481 (ADR-0089 §2-4) — le menu de l'espace actif : persona, menu composé, cadenas. Sorti
 * d'`AppSidebar` pour que la barre latérale, le tiroir et la barre d'onglets mobile se dérivent de
 * la MÊME composition : un persona calculé deux fois finit par diverger.
 *
 * TCK-2478 (ADR-0089) — LE menu : la disposition du persona du profil actif, composée par une
 * fonction pure. Ses lecteurs n'affichent que ce qu'elle rend, et ne portent aucune condition de
 * rôle — hormis le cadenas de l'agence `individual` (`isProRouteLocked`), qui est un confort d'écran.
 */
export function useMenuDeLEspace({
  user,
  agencyIsStandard,
  typeProfilActif,
  agencySuspended = false,
}: ParametresDuMenu): MenuDeLEspace {
  const accesAdmin = useAccesAdminOuRepli({
    roles: user.roles,
    agencyId: user.agency_id,
    agencyIsStandard,
  });
  // P152.03 — les capacités du profil actif, lues pour le seul personnel (le cache est amorcé par le
  // layout pour l'admin d'agence, `AmorceCapacites`). Le super-admin passe tout, sans lecture.
  const lireCapacites = (isAgent(user.roles) || isAdmin(user.roles)) && !isSuperAdmin(user.roles);
  const { data: mesCapacites } = useMyCapabilities(undefined, lireCapacites);
  const capacites = lireCapacites ? (mesCapacites?.data.capabilities ?? null) : [];

  // TCK-2480 — `personaDeLaCoque` : la MÊME formule que le fournisseur des préférences (`AppShell`).
  const persona = personaDeLaCoque({
    roles: user.roles,
    typeProfilActif,
    espaceIndividuel: accesAdmin.espaceIndividuel,
    agencyIsStandard,
  });
  const ctx: ContexteDeMenu = {
    roles: user.roles,
    capacites,
    cheminsAdmin: accesAdmin.chemins,
    agenceSuspendue: agencySuspended,
  };
  // TCK-2480 — les préférences du compte, PAR PERSONA (un geste n'écrit que sous le persona affiché) ;
  // sans fournisseur, aucune (repli inerte, A12).
  const prefs = usePreferencesDuMenu();
  const menu = composerMenu(ctx, persona, undefined, prefsDe(prefs.navigation, persona));
  const verrouiller = (e: EntreeComposee): EntreeRendue => ({
    ...e,
    locked: isProRouteLocked(user, agencyIsStandard, e.href),
  });
  const rendre = (gs: readonly GroupeCompose[]): GroupeRendu[] =>
    gs.map((g) => ({ ...g, entrees: g.entrees.map(verrouiller) }));
  const groupes = rendre(menu.groupes);
  return {
    persona,
    ctx,
    menu,
    groupes,
    entrees: groupes.flatMap((g) => g.entrees),
    groupesDeLaDisposition: rendre(composerMenu(ctx, persona).groupes),
  };
}
