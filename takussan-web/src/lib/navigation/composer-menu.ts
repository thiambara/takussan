import type { LucideIcon } from 'lucide-react';
import { CATALOGUE, cleDe, estOuverte, iconeDe, type Destination, type IdDestination } from './catalogue';
import { DISPOSITIONS, type Disposition } from './dispositions';
import { autresTypes, rolesDuPersona, type Persona } from './personas';
import type { ContexteDeMenu, NavCounterKey, NavSection } from './types';

export interface EntreeComposee {
  readonly id: IdDestination;
  readonly href: string;
  readonly labelKey: string;
  readonly labelSpace?: 'nav.admin';
  readonly icon: LucideIcon;
  readonly groupe: string;
  readonly emphasized?: boolean;
  readonly counterKey?: NavCounterKey;
  readonly publique?: true;
}

export interface GroupeCompose {
  readonly id: string;
  readonly titre: string | null;
  readonly titreValeurs?: Readonly<Record<string, string>>;
  readonly replie: boolean;
  readonly entrees: readonly EntreeComposee[];
}

export interface MenuCompose {
  readonly persona: Persona;
  readonly action: EntreeComposee | null;
  readonly carte: EntreeComposee | null;
  readonly groupes: readonly GroupeCompose[];
}

type DestinationDuCatalogue = Destination & { readonly id: IdDestination };

const PAR_ID: ReadonlyMap<string, DestinationDuCatalogue> = new Map(CATALOGUE.map((d) => [d.id, d]));

/**
 * TCK-2478 (ADR-0089 §4) — LE menu : une fonction pure du compte, du persona et de sa disposition.
 *
 * 1. L'action principale : la première destination OUVERTE de `disposition.action`. Elle ne prend
 *    pas l'`href` : le locataire garde « Paiements » dans son groupe sous « Payer mon loyer ».
 * 2. Les groupes, puis « Plus » (ses entrées citées, puis toute destination ouverte au persona que
 *    rien ne place) — jugés sur les RÔLES DU PERSONA ; une seule entrée par `href`.
 * 3. Le complément « Aussi … » : ce que l'union de l'espace ouvre et que le persona n'ouvre pas.
 * 4. Un groupe vide ne se rend pas ; un identifiant inconnu est ignoré.
 */
export function composerMenu(
  ctx: ContexteDeMenu,
  persona: Persona,
  disposition: Disposition = DISPOSITIONS[persona],
): MenuCompose {
  const ctxPersona: ContexteDeMenu = { ...ctx, roles: rolesDuPersona(ctx.roles, persona) };
  const hrefsPris = new Set<string>();
  const places = new Set<string>([...disposition.action, ...(disposition.carte ? [disposition.carte] : [])]);

  const composer = (d: DestinationDuCatalogue, groupe: string, cle?: string): EntreeComposee => ({
    id: d.id,
    href: d.href,
    labelKey: cle ?? disposition.libelles?.[d.id] ?? cleDe(d, ctx),
    icon: iconeDe(d, ctx),
    groupe,
    ...(d.espace ? { labelSpace: d.espace } : {}),
    ...(d.misEnAvant ? { emphasized: true } : {}),
    ...(d.compteur ? { counterKey: d.compteur } : {}),
    ...(d.publique ? { publique: true as const } : {}),
  });

  const prendre = (d: DestinationDuCatalogue | undefined, groupe: string, c: ContexteDeMenu): EntreeComposee | null => {
    if (!d || hrefsPris.has(d.href) || !estOuverte(d, c)) return null;
    hrefsPris.add(d.href);
    return composer(d, groupe);
  };

  const actionDestination = disposition.action.map((id) => PAR_ID.get(id)).find((d) => d && estOuverte(d, ctxPersona));
  const action = actionDestination ? composer(actionDestination, 'action', disposition.libelleAction) : null;

  const carteDestination = disposition.carte ? PAR_ID.get(disposition.carte) : undefined;
  const carte = carteDestination && estOuverte(carteDestination, ctxPersona) ? composer(carteDestination, 'carte') : null;

  const groupes: GroupeCompose[] = [];
  for (const groupe of disposition.groupes) {
    const entrees: EntreeComposee[] = [];
    for (const id of groupe.entrees) {
      places.add(id);
      const entree = prendre(PAR_ID.get(id), groupe.id, ctxPersona);
      if (entree) entrees.push(entree);
    }
    groupes.push({ id: groupe.id, titre: groupe.titre, replie: groupe.replie === true, entrees });
  }

  const plus: EntreeComposee[] = [];
  for (const id of disposition.plus) {
    places.add(id);
    const entree = prendre(PAR_ID.get(id), 'plus', ctxPersona);
    if (entree) plus.push(entree);
  }
  for (const d of CATALOGUE) {
    if (places.has(d.id)) continue;
    const entree = prendre(d, 'plus', ctxPersona);
    if (entree) plus.push(entree);
  }
  groupes.push({ id: 'plus', titre: 'plus', replie: true, entrees: plus });

  const aussi: EntreeComposee[] = [];
  for (const d of CATALOGUE) {
    if (estOuverte(d, ctxPersona)) continue;
    const entree = prendre(d, 'aussi', ctx);
    if (entree) aussi.push(entree);
  }
  const autres = autresTypes(ctx.roles, persona);
  groupes.push({
    id: 'aussi',
    titre: autres.length === 1 ? 'aussi' : 'aussiPlusieurs',
    ...(autres.length === 1 ? { titreValeurs: { profil: autres[0] } } : {}),
    replie: true,
    entrees: aussi,
  });

  return { persona, action, carte, groupes: groupes.filter((g) => g.entrees.length > 0) };
}

/** TCK-377 — un titre ne paraît que s'il sépare : au moins un groupe titré de deux entrées. */
export function avecTitres(groupes: readonly GroupeCompose[]): boolean {
  if (groupes.length <= 1) return false;
  return groupes.some((g) => g.titre !== null && g.entrees.length > 1);
}

/** Les entrées des groupes, à plat (l'action et la carte n'en sont pas). */
export function entreesDuMenu(menu: MenuCompose): EntreeComposee[] {
  return menu.groupes.flatMap((g) => g.entrees);
}

/** Forme à plat de l'adaptateur {@link menuDuPersona} — celle de `NavItem` (`AppSidebar`). */
export interface EntreeAPlat {
  readonly id: IdDestination;
  readonly href: string;
  readonly labelKey: string;
  readonly labelSpace?: 'nav.admin';
  readonly icon: LucideIcon;
  readonly section: NavSection;
  readonly emphasized?: boolean;
  readonly counterKey?: NavCounterKey;
}

const SECTION_DU_GROUPE: Readonly<Record<string, NavSection>> = { tete: 'primary', plus: 'plus', aussi: 'plus' };

/**
 * @deprecated TCK-2478 (tâche 4 la retire) — adaptateur TEMPORAIRE pour le rendu d'avant
 * (`buildNavItems` d'`AppSidebar`, sections `NavSection`), le temps que la barre rende le
 * `MenuCompose`. Il aplatit le menu composé : action et carte en tête (`primary`), la tête en
 * `primary`, « Plus » et « Aussi … » en `plus`, tout autre groupe en `manage`. Aucune règle d'accès
 * ici : tout vient de {@link composerMenu}.
 */
export function menuDuPersona(ctx: ContexteDeMenu, persona: Persona): EntreeAPlat[] {
  const menu = composerMenu(ctx, persona);
  const libelleAction = DISPOSITIONS[persona].libelleAction;
  const aPlat = (e: EntreeComposee, section: NavSection, labelKey = e.labelKey): EntreeAPlat => ({
    id: e.id,
    href: e.href,
    labelKey,
    icon: e.icon,
    section,
    ...(e.labelSpace ? { labelSpace: e.labelSpace } : {}),
    ...(e.emphasized ? { emphasized: true } : {}),
    ...(e.counterKey ? { counterKey: e.counterKey } : {}),
  });
  const sortie: EntreeAPlat[] = [];
  if (menu.action) {
    sortie.push(aPlat(menu.action, 'primary', libelleAction ? `actions.${libelleAction}` : menu.action.labelKey));
  }
  if (menu.carte) sortie.push(aPlat(menu.carte, 'primary'));
  for (const groupe of menu.groupes) {
    for (const e of groupe.entrees) {
      if (sortie.some((s) => s.href === e.href)) continue;
      sortie.push(aPlat(e, SECTION_DU_GROUPE[groupe.id] ?? 'manage'));
    }
  }
  return sortie;
}
