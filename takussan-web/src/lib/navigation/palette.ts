import { ArrowLeftRight, type LucideIcon } from 'lucide-react';
import { replierPourRecherche } from '@/components/ui/combobox';
import type { Profile } from '@/types/profile';
import type { PastilleATraiter } from './a-traiter';
import { APP_EXACT_ROOTS, resolveActiveHref } from './active-path';
import type { IdDestination } from './catalogue';
import type { EntreeComposee, GroupeCompose } from './composer-menu';

/**
 * TCK-2482 (ADR-0089 §4) — la palette de commandes de `/app` : ce qu'elle propose, et comment elle
 * cherche. Deux fonctions pures ; `PaletteDeCommandes` ne fait que les rendre.
 *
 * - Elle ne lit que le MENU RENDU (`useMenuDeLEspace` : persona, `composerMenu`, cadenas). Une
 *   destination que le menu ne rend pas — fermée au compte, ou cadenassée — n'y est jamais : la palette
 *   ne relit pas le catalogue, et `palette.test.ts` le garde sur les huit personas.
 * - Les groupes paraissent toujours dans l'ordre de `GROUPES_DE_LA_PALETTE` ; la frappe ne réordonne
 *   qu'À L'INTÉRIEUR d'un groupe.
 * - Aucun tri par usage (ADR-0089 §5) : « Récents » est un groupe à part, montré sur un champ vide.
 */
export const GROUPES_DE_LA_PALETTE = ['actions', 'a-traiter', 'recents', 'aller-a', 'espaces'] as const;
export type GroupeDeLaPalette = (typeof GROUPES_DE_LA_PALETTE)[number];

export type CibleDeLaPalette =
  | { readonly type: 'lien'; readonly href: string; readonly publique?: true }
  | { readonly type: 'espace'; readonly profilId: string };

export interface OptionDeLaPalette {
  /** Unique dans la liste : `<groupe>:<identifiant>`. */
  readonly cle: string;
  readonly groupe: GroupeDeLaPalette;
  readonly libelle: string;
  /** Affichée après le libellé (« Aussi administrateur ») ; jamais cherchée. */
  readonly precision?: string;
  /** Les synonymes déclarés dans les messages : cherchés, jamais affichés. */
  readonly motsCles: readonly string[];
  readonly icone: LucideIcon;
  readonly cible: CibleDeLaPalette;
}

/**
 * La forme que rend `useMenuDeLEspace` (`EntreeRendue`, `GroupeRendu`), redite ici pour que ce module
 * pur n'importe pas un crochet client. `Omit` et non une intersection : sur `GroupeCompose & …`,
 * `entrees` reste typé `EntreeComposee` à la lecture, et le cadenas disparaîtrait du typage.
 */
export type EntreeDuMenuRendu = EntreeComposee & { readonly locked?: boolean };
export type GroupeDuMenuRendu = Omit<GroupeCompose, 'entrees'> & { readonly entrees: readonly EntreeDuMenuRendu[] };

export interface SourcesDeLaPalette {
  readonly action: EntreeComposee | null;
  readonly carte: EntreeComposee | null;
  readonly groupes: readonly GroupeDuMenuRendu[];
  readonly pastilles: readonly PastilleATraiter[];
  /** Les espaces à proposer (`espacesAProposer`), l'espace actif déjà retiré. */
  readonly espaces: readonly Profile[];
  /** Les chemins retenus sur l'appareil (`lirePagesRecentes`), le plus récent d'abord. */
  readonly recents: readonly string[];
  readonly pathname: string | null;
}

/** Le texte naît loin de l'écran : la donnée porte la clé, le rendu la résout (TCK-286). */
export interface LibellesDeLaPalette {
  readonly entree: (e: EntreeComposee) => string;
  readonly action: (e: EntreeComposee) => string;
  readonly carte: (e: EntreeComposee) => string;
  readonly precision: (g: GroupeCompose) => string | null;
  readonly synonymes: (id: IdDestination) => readonly string[];
  readonly pastille: (p: PastilleATraiter) => string;
  readonly espace: (p: Profile) => string;
  readonly motsEspace: readonly string[];
}

export const RECENTS_AFFICHES = 5;

/** `" loyer, quittance ,, payer "` → `['loyer', 'quittance', 'payer']`. */
export function decouperLesMots(texte: string): string[] {
  return texte.split(',').map((m) => m.trim()).filter((m) => m !== '');
}

function cibleDe(e: EntreeComposee): CibleDeLaPalette {
  return { type: 'lien', href: e.href, ...(e.publique ? { publique: true as const } : {}) };
}

export function optionsDeLaPalette(s: SourcesDeLaPalette, l: LibellesDeLaPalette): OptionDeLaPalette[] {
  const options: OptionDeLaPalette[] = [];
  const rendues = s.groupes.flatMap((g) => g.entrees.filter((e) => !e.locked).map((e) => ({ e, g })));
  const parHref = new Map<string, EntreeComposee>();
  for (const { e } of rendues) if (!parHref.has(e.href)) parHref.set(e.href, e);

  // ➊ — l'action principale telle que la barre la rend (absente d'un espace suspendu, TCK-600).
  if (s.action) {
    options.push({
      cle: `actions:${s.action.id}`,
      groupe: 'actions',
      libelle: l.action(s.action),
      motsCles: l.synonymes(s.action.id),
      icone: s.action.icon,
      cible: cibleDe(s.action),
    });
  }

  // À traiter — les pastilles de la bande, déjà jugées (`pastillesATraiter`), cherchables aussi par le
  // nom de leur entrée : « 3 visites en attente » se trouve par « visites ».
  for (const p of s.pastilles) {
    const e = rendues.find((r) => r.e.counterKey === p.cle)?.e;
    if (!e) continue;
    options.push({
      cle: `a-traiter:${p.cle}`,
      groupe: 'a-traiter',
      libelle: l.pastille(p),
      motsCles: [l.entree(e), ...l.synonymes(e.id)],
      icone: e.icon,
      cible: { type: 'lien', href: p.href },
    });
  }

  // Récents — résolus sur le menu D'AUJOURD'HUI : un chemin qu'il ne couvre plus disparaît.
  const hrefs = [...parHref.keys()];
  const courant = resolveActiveHref(s.pathname, hrefs, APP_EXACT_ROOTS);
  const vus = new Set<string>();
  for (const chemin of s.recents) {
    if (vus.size === RECENTS_AFFICHES) break;
    const href = resolveActiveHref(chemin, hrefs, APP_EXACT_ROOTS);
    const e = href === null ? undefined : parHref.get(href);
    if (!e || href === courant || vus.has(e.href)) continue;
    vus.add(e.href);
    options.push({ cle: `recents:${e.id}`, groupe: 'recents', libelle: l.entree(e), motsCles: [], icone: e.icon, cible: cibleDe(e) });
  }

  // Aller à — le menu entier, dans son ordre : groupes, « Plus », complément « Aussi … », puis la carte.
  for (const { e, g } of rendues) {
    const precision = l.precision(g);
    options.push({
      cle: `aller-a:${e.id}`,
      groupe: 'aller-a',
      libelle: l.entree(e),
      ...(precision ? { precision } : {}),
      motsCles: l.synonymes(e.id),
      icone: e.icon,
      cible: cibleDe(e),
    });
  }
  if (s.carte) {
    options.push({
      cle: `aller-a:${s.carte.id}`,
      groupe: 'aller-a',
      libelle: l.carte(s.carte),
      motsCles: l.synonymes(s.carte.id),
      icone: s.carte.icon,
      cible: cibleDe(s.carte),
    });
  }

  for (const p of s.espaces) {
    options.push({
      cle: `espaces:${p.id}`,
      groupe: 'espaces',
      libelle: l.espace(p),
      motsCles: l.motsEspace,
      icone: ArrowLeftRight,
      cible: { type: 'espace', profilId: p.id },
    });
  }
  return options;
}

/** A3 — 4 : le libellé commence par le mot ; 3 : un mot du libellé ; 2 : un mot d'un synonyme ; 1 : contenu. */
function scoreDuMot(mot: string, libelle: string, synonymes: readonly string[]): number {
  if (libelle.startsWith(mot)) return 4;
  if (libelle.split(' ').some((m) => m.startsWith(mot))) return 3;
  if (synonymes.some((s) => s.split(' ').some((m) => m.startsWith(mot)))) return 2;
  if (libelle.includes(mot) || synonymes.some((s) => s.includes(mot))) return 1;
  return 0;
}

/**
 * La recherche : repli des accents, de la casse et des séparateurs (`replierPourRecherche`, la règle du
 * dépôt) ; chaque mot saisi doit correspondre ; tri par groupe, puis par score, puis dans l'ordre reçu.
 * Un champ vide rend tout ; une saisie retire « Récents ».
 */
export function chercherDansLaPalette(options: readonly OptionDeLaPalette[], requete: string): OptionDeLaPalette[] {
  const mots = replierPourRecherche(requete).split(' ').filter((m) => m !== '');
  if (mots.length === 0) return [...options];
  const rang = (g: GroupeDeLaPalette) => GROUPES_DE_LA_PALETTE.indexOf(g);
  const notees: { readonly option: OptionDeLaPalette; readonly score: number; readonly ordre: number }[] = [];
  options.forEach((option, ordre) => {
    if (option.groupe === 'recents') return;
    const libelle = replierPourRecherche(option.libelle);
    const synonymes = option.motsCles.map(replierPourRecherche);
    let score = 0;
    for (const mot of mots) {
      const s = scoreDuMot(mot, libelle, synonymes);
      if (s === 0) return;
      score += s;
    }
    notees.push({ option, score, ordre });
  });
  return notees
    .sort((a, b) => rang(a.option.groupe) - rang(b.option.groupe) || b.score - a.score || a.ordre - b.ordre)
    .map((n) => n.option);
}
