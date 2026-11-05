import type { LucideIcon } from 'lucide-react';
import { CATALOGUE, cleDe, estOuverte, iconeDe, type Destination, type IdDestination } from './catalogue';
import type { ModeDemarrer } from './demarrer';
import { DISPOSITIONS, type Disposition } from './dispositions';
import { autresTypes, rolesDuPersona, type Persona } from './personas';
import type { ContexteDeMenu, NavCounterKey } from './types';

export interface EntreeComposee {
  readonly id: IdDestination;
  readonly href: string;
  readonly labelKey: string;
  readonly labelSpace?: 'nav.admin';
  readonly icon: LucideIcon;
  readonly groupe: string;
  readonly emphasized?: boolean;
  readonly counterKey?: NavCounterKey;
  /** TCK-2479 — la page filtrée sur ce qui attend : la cible de la pastille « À traiter ». */
  readonly hrefATraiter?: string;
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
  /** TCK-2479 — l'ordre (et la liste blanche) de la bande « À traiter ». */
  readonly priorites: readonly NavCounterKey[];
  /** TCK-2479 — le groupe « Démarrer », `null` sans lui ou dans un espace suspendu (TCK-600). */
  readonly demarrer: ModeDemarrer | null;
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
 *    Une destination `surLEspace` (créer un bien) se juge sur l'union partout : jamais dans « Aussi ».
 * 4. Un groupe vide ne se rend pas ; un identifiant inconnu est ignoré.
 */
export function composerMenu(
  ctx: ContexteDeMenu,
  persona: Persona,
  disposition: Disposition = DISPOSITIONS[persona],
): MenuCompose {
  const ctxPersona: ContexteDeMenu = { ...ctx, roles: rolesDuPersona(ctx.roles, persona), rolesDeLEspace: ctx.roles };
  // Revue de TCK-2478 (I2) — le contexte qui juge une destination POUR LE PERSONA.
  const juge = (d: Destination): ContexteDeMenu => (d.surLEspace ? ctx : ctxPersona);
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
    ...(d.hrefATraiter ? { hrefATraiter: d.hrefATraiter } : {}),
    ...(d.publique ? { publique: true as const } : {}),
  });

  const prendre = (d: DestinationDuCatalogue | undefined, groupe: string, c?: ContexteDeMenu): EntreeComposee | null => {
    if (!d || hrefsPris.has(d.href) || !estOuverte(d, c ?? juge(d))) return null;
    hrefsPris.add(d.href);
    return composer(d, groupe);
  };

  const actionDestination = disposition.action.map((id) => PAR_ID.get(id)).find((d) => d && estOuverte(d, juge(d)));
  const action = actionDestination ? composer(actionDestination, 'action', disposition.libelleAction) : null;

  const carteDestination = disposition.carte ? PAR_ID.get(disposition.carte) : undefined;
  const carte = carteDestination && estOuverte(carteDestination, juge(carteDestination)) ? composer(carteDestination, 'carte') : null;

  const groupes: GroupeCompose[] = [];
  for (const groupe of disposition.groupes) {
    const entrees: EntreeComposee[] = [];
    for (const id of groupe.entrees) {
      places.add(id);
      const entree = prendre(PAR_ID.get(id), groupe.id);
      if (entree) entrees.push(entree);
    }
    groupes.push({ id: groupe.id, titre: groupe.titre, replie: groupe.replie === true, entrees });
  }

  const plus: EntreeComposee[] = [];
  for (const id of disposition.plus) {
    places.add(id);
    const entree = prendre(PAR_ID.get(id), 'plus');
    if (entree) plus.push(entree);
  }
  for (const d of CATALOGUE) {
    if (places.has(d.id)) continue;
    const entree = prendre(d, 'plus');
    if (entree) plus.push(entree);
  }
  groupes.push({ id: 'plus', titre: 'plus', replie: true, entrees: plus });

  const aussi: EntreeComposee[] = [];
  for (const d of CATALOGUE) {
    if (estOuverte(d, juge(d))) continue;
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

  return {
    persona,
    action,
    carte,
    groupes: groupes.filter((g) => g.entrees.length > 0),
    priorites: disposition.priorites,
    demarrer: ctx.agenceSuspendue ? null : (disposition.demarrer ?? null),
  };
}

/**
 * Les groupes qui sont des DIVULGATIONS, pas des sections : « Plus » et le complément « Aussi … ».
 * Ils rendent toujours leur bouton de bascule, et ne comptent pas dans {@link avecTitres}.
 */
export const GROUPES_DIVULGATION: ReadonlySet<string> = new Set(['plus', 'aussi']);

/**
 * TCK-377 — un titre de SECTION ne paraît que s'il sépare : au moins deux sections, dont une titrée
 * de deux entrées ou plus.
 *
 * TCK-2478 (décision de la session du 2026-11-05) — « Plus » et « Aussi … » n'entrent pas dans ce
 * calcul ({@link GROUPES_DIVULGATION}). Chez un vrai prestataire (`service_provider` + le plancher
 * `customer`), la tête sans titre est suivie d'un « Plus » de six entrées (`occupeUnLogement`,
 * TCK-379, inchangé, et le calendrier de ses interventions) : compté comme une section, il faisait
 * paraître des titres que l'AC5 refuse.
 */
export function avecTitres(groupes: readonly GroupeCompose[]): boolean {
  const sections = groupes.filter((g) => !GROUPES_DIVULGATION.has(g.id));
  if (sections.length <= 1) return false;
  return sections.some((g) => g.titre !== null && g.entrees.length > 1);
}

/** Les entrées des groupes, à plat (l'action et la carte n'en sont pas). */
export function entreesDuMenu(menu: MenuCompose): EntreeComposee[] {
  return menu.groupes.flatMap((g) => g.entrees);
}

/**
 * Revue de TCK-2479 (M6) — le compte ouvre-t-il ce chemin ? Jugé par le catalogue, sur l'ESPACE
 * (`ctx`, pas le persona) : les gardes des pages sont celles du compte et du profil actif — la table
 * des pages d'administration (`cheminsAdmin`, la garde de `garderPageAdmin`) et `peutPublier` / le
 * bailleur pour `/app/properties/new` (la règle de `modeDeCreationDeBien`). La requête est ignorée.
 * Un chemin qu'aucune destination ne porte (`/onboarding/owner`, l'assistant du bailleur sur son
 * propre profil) n'est pas jugé ici : `true`.
 */
export function cheminOuvert(ctx: ContexteDeMenu, href: string): boolean {
  const chemin = href.split('?')[0];
  const portees = CATALOGUE.filter((d) => d.href === chemin);
  return portees.length === 0 || portees.some((d) => estOuverte(d, ctx));
}
