import { ArrowLeftRight, History, Search, type LucideIcon } from 'lucide-react';
import { replierPourRecherche } from '@/components/ui/combobox';
import type { Profile } from '@/types/profile';
import { parametreDe } from '@/types/search';
import type { LigneAujourdhui } from './a-traiter';
import { APP_EXACT_ROOTS, resolveActiveHref } from './active-path';
import type { IdDestination } from './catalogue';
import type { EntreeComposee, GroupeCompose } from './composer-menu';
import { estUneFiche, sansRequete, type PageRecente, type TypeDeFiche } from './pages-recentes';

/**
 * TCK-2482 (ADR-0089 §4) — la palette de commandes de `/app` : ce qu'elle propose, et comment elle
 * cherche. Deux fonctions pures ; `PaletteDeCommandes` ne fait que les rendre.
 *
 * - Elle ne lit que le MENU RENDU (`useMenuDeLEspace` : persona, `composerMenu`, cadenas). Une
 *   destination que le menu ne rend pas — fermée au compte, ou cadenassée — n'y est jamais : la palette
 *   ne relit pas le catalogue, et `palette.test.ts` le garde sur les huit personas.
 * - Les groupes paraissent toujours dans l'ordre de `GROUPES_DE_LA_PALETTE` ; la frappe ne réordonne
 *   qu'À L'INTÉRIEUR d'un groupe. TCK-2845 — l'ordre de la maquette : Actions · À traiter · Aller à ·
 *   Récents · Espaces. {@link optionsDeLaPalette} rend ses options DANS CET ORDRE : la liste plate est
 *   celle que parcourent les flèches, elle doit suivre l'ordre affiché.
 * - Aucun tri par usage (ADR-0089 §5) : « Récents » est un groupe à part, montré sur un champ vide.
 * - TCK-2489 (ADR-0090 §2) — la recherche d'annonces du site public y entre ({@link avecLaRechercheDAnnonces}) :
 *   « Annonces » est le DERNIER groupe, pour qu'Entrée sur « mess » ouvre la messagerie, pas la liste.
 */
export const GROUPES_DE_LA_PALETTE = ['actions', 'a-traiter', 'aller-a', 'recents', 'espaces', 'annonces'] as const;
export type GroupeDeLaPalette = (typeof GROUPES_DE_LA_PALETTE)[number];

export type CibleDeLaPalette =
  | { readonly type: 'lien'; readonly href: string; readonly publique?: true }
  | { readonly type: 'espace'; readonly profilId: string };

export interface OptionDeLaPalette {
  /** Unique dans la liste : `<groupe>:<identifiant>`. */
  readonly cle: string;
  readonly groupe: GroupeDeLaPalette;
  readonly libelle: string;
  /**
   * Affichée à droite, en petit gris (« Aussi administrateur », TCK-2845 : « Épinglé », « Agence »,
   * « Site public », le rôle d'un espace) ; jamais cherchée.
   */
  readonly precision?: string;
  /** TCK-2845 — le nombre d'une ligne « À traiter », rendu en pastille : jamais écrit dans le libellé. */
  readonly compte?: number;
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
  /** TCK-2489 — les lignes « Aujourd'hui » de la barre (`lignesAujourdhui`), toutes. */
  readonly pastilles: readonly LigneAujourdhui[];
  /** Les espaces à proposer (`espacesAProposer`), l'espace actif déjà retiré. */
  readonly espaces: readonly Profile[];
  /** TCK-2846 — les pages et fiches retenues sur l'appareil (`lirePagesRecentes`), le plus récent d'abord. */
  readonly recents: readonly PageRecente[];
  readonly pathname: string | null;
}

/** Le texte naît loin de l'écran : la donnée porte la clé, le rendu la résout (TCK-286). */
export interface LibellesDeLaPalette {
  readonly entree: (e: EntreeComposee) => string;
  readonly action: (e: EntreeComposee) => string;
  readonly carte: (e: EntreeComposee) => string;
  readonly precision: (g: GroupeCompose) => string | null;
  /** TCK-2845 — la précision d'une entrée épinglée (« Épinglé ») : elle passe avant celle du groupe. */
  readonly epinglee: string;
  readonly synonymes: (id: IdDestination) => readonly string[];
  readonly pastille: (p: LigneAujourdhui) => string;
  readonly espace: (p: Profile) => string;
  /** TCK-2845 — la précision d'un espace (son rôle, « Propriétaire ») ; `null` si le libellé le dit déjà. */
  readonly roleDeLEspace: (p: Profile) => string | null;
  readonly motsEspace: readonly string[];
  /** TCK-2846 — le type d'une fiche récente (« Bien », « Demande »), en précision. */
  readonly typeDeFiche: (type: TypeDeFiche) => string;
}

export const RECENTS_AFFICHES = 5;

/** `" loyer, quittance ,, payer "` → `['loyer', 'quittance', 'payer']`. */
export function decouperLesMots(texte: string): string[] {
  return texte.split(',').map((m) => m.trim()).filter((m) => m !== '');
}

/**
 * Revue I3 — LA résolution d'un chemin vers l'entrée du menu qui le couvre : le plus long préfixe parmi
 * les entrées rendues non cadenassées (`resolveActiveHref`, `/app` et `/app/agency` comparés à l'égal).
 * Une seule fonction pour l'écriture des récents (la coque, `RetenirLaPageRecente`, qui dédoublonne par
 * entrée) et pour leur lecture (`optionsDeLaPalette`) : deux résolutions finiraient par diverger.
 * Rend le `href` de l'entrée, ou `null` si aucune ne couvre le chemin.
 */
export function resolveurDesRecents(groupes: readonly GroupeDuMenuRendu[]): (chemin: string | null) => string | null {
  const hrefs = [...new Set(groupes.flatMap((g) => g.entrees.filter((e) => !e.locked).map((e) => e.href)))];
  return (chemin) => resolveActiveHref(chemin, hrefs, APP_EXACT_ROOTS);
}

function cibleDe(e: EntreeComposee): CibleDeLaPalette {
  return { type: 'lien', href: e.href, ...(e.publique ? { publique: true as const } : {}) };
}

/**
 * TCK-2846 — un récent tel que le rendent la palette, la colonne/le tiroir et la page introuvable.
 * Une page du menu porte son `entree` (le libellé se résout au rendu) ; une fiche son `titre` et son `type`.
 */
export interface RecentResolu {
  /** Unique : `fiche:<type>:<id>` ou `page:<href>`. */
  readonly cle: string;
  readonly href: string;
  readonly entree: EntreeDuMenuRendu | null;
  readonly titre: string;
  readonly type: TypeDeFiche | null;
}

/**
 * TCK-2846 — LA lecture des récents, commune aux trois surfaces : dans l'ordre retenu (le plus récent
 * d'abord), `max` au plus, sans la page courante.
 *
 * - Une page du menu se résout sur le menu D'AUJOURD'HUI (`resolveurDesRecents`) : une entrée qu'il ne
 *   rend plus disparaît ; dédoublonnée par entrée ; écartée quand la page courante relève de la même.
 * - Une fiche reste tant que le menu couvre sa section (un espace qui perd le module perd ses fiches),
 *   dédoublonnée par entité ; écartée quand c'est la page courante.
 */
export function recentsResolus(
  recents: readonly PageRecente[],
  groupes: readonly GroupeDuMenuRendu[],
  pathname: string | null,
  max: number,
): RecentResolu[] {
  const entreeDe = resolveurDesRecents(groupes);
  const parHref = new Map<string, EntreeDuMenuRendu>();
  for (const g of groupes) for (const e of g.entrees) if (!e.locked && !parHref.has(e.href)) parHref.set(e.href, e);
  const courant = entreeDe(pathname);
  const vus = new Set<string>();
  const rendus: RecentResolu[] = [];
  for (const page of recents) {
    if (rendus.length === max) break;
    if (estUneFiche(page)) {
      const cle = `fiche:${page.type}:${page.id}`;
      if (vus.has(cle) || page.chemin === pathname || entreeDe(sansRequete(page.chemin)) === null) continue;
      vus.add(cle);
      rendus.push({ cle, href: page.chemin, entree: null, titre: page.titre, type: page.type });
      continue;
    }
    const href = entreeDe(page.chemin);
    const e = href === null ? undefined : parHref.get(href);
    if (!e || href === courant || vus.has(`page:${e.href}`)) continue;
    vus.add(`page:${e.href}`);
    rendus.push({ cle: `page:${e.href}`, href: e.href, entree: e, titre: '', type: null });
  }
  return rendus;
}

export function optionsDeLaPalette(s: SourcesDeLaPalette, l: LibellesDeLaPalette): OptionDeLaPalette[] {
  const options: OptionDeLaPalette[] = [];
  const rendues = s.groupes.flatMap((g) => g.entrees.filter((e) => !e.locked).map((e) => ({ e, g })));

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

  // À traiter — les lignes « Aujourd'hui », déjà jugées (`lignesAujourdhui`), cherchables aussi par le
  // nom de leur entrée : « Visites à confirmer » se trouve par « visites ». TCK-2845 — le nombre va en
  // pastille (`compte`), le libellé n'en porte plus.
  for (const p of s.pastilles) {
    const e = rendues.find((r) => r.e.counterKey === p.cle)?.e;
    if (!e) continue;
    options.push({
      cle: `a-traiter:${p.cle}`,
      groupe: 'a-traiter',
      libelle: l.pastille(p),
      compte: p.nombre,
      motsCles: [l.entree(e), ...l.synonymes(e.id)],
      icone: e.icon,
      cible: { type: 'lien', href: p.href },
    });
  }

  // Aller à — le menu entier, dans son ordre : groupes, « Plus », complément « Aussi … », puis la carte.
  for (const { e, g } of rendues) {
    const libelle = l.entree(e);
    // TCK-2845 — « Épinglé » passe avant la précision du groupe ; une précision qui redit le libellé
    // (la fiche « Agence » du groupe Agence) n'est pas affichée.
    const brute = e.epinglee ? l.epinglee : l.precision(g);
    const precision = brute === libelle ? null : brute;
    options.push({
      cle: `aller-a:${e.id}`,
      groupe: 'aller-a',
      libelle,
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

  // Récents — TCK-2846 : LA lecture commune (`recentsResolus`), la même que la colonne et la page
  // introuvable. Une fiche y est nommée par son titre, son type en précision ; une page du menu par
  // son entrée. Icône d'horloge pour toutes (maquette `app-coque` e4).
  for (const r of recentsResolus(s.recents, s.groupes, s.pathname, RECENTS_AFFICHES)) {
    options.push({
      cle: `recents:${r.cle}`,
      groupe: 'recents',
      libelle: r.entree ? l.entree(r.entree) : r.titre,
      ...(r.type ? { precision: l.typeDeFiche(r.type) } : {}),
      motsCles: [],
      icone: History,
      cible: r.entree ? cibleDe(r.entree) : { type: 'lien', href: r.href },
    });
  }

  for (const p of s.espaces) {
    const role = l.roleDeLEspace(p);
    options.push({
      cle: `espaces:${p.id}`,
      groupe: 'espaces',
      libelle: l.espace(p),
      ...(role ? { precision: role } : {}),
      // Le rôle quitte le libellé pour la précision, qui n'est jamais cherchée : il reste un mot-clé
      // (« propriétaire » trouve « Basculer vers Agence Teranga »).
      motsCles: role ? [...l.motsEspace, role] : l.motsEspace,
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

/** TCK-2489 — la liste publique des annonces, celle de la recherche du site (`SearchAutocomplete`). */
export const CHEMIN_DES_ANNONCES = '/properties';

export interface LibellesDesAnnonces {
  /** « Chercher un bien sur Takussan » : champ vide. */
  readonly generique: string;
  /** TCK-2845 — sa précision, « Site public » : elle quitte `/app`. */
  readonly sitePublic: string;
  /** « Chercher « {q} » parmi les annonces » : avec du texte tapé. */
  readonly avecTexte: (requete: string) => string;
}

/**
 * TCK-2489 (ADR-0090 §2) — la recherche d'annonces du site public, entrée dans la palette quand la
 * barre du haut (et son `SearchAutocomplete`) quitte la coque de `/app`. Pure : elle complète les
 * résultats de {@link chercherDansLaPalette}.
 *
 * - Champ vide : « Chercher un bien sur Takussan » (vers `/properties`), placée après les actions du
 *   persona — sauf si le menu y mène déjà (l'action « Chercher un bien » du client, l'entrée du
 *   locataire) : une destination, une ligne.
 * - Texte tapé : « Chercher « … » parmi les annonces », vers `/properties?q=…` — le paramètre plein-texte
 *   de la recherche publique (`parametreDe('q')`, celui qu'écrit `SearchAutocomplete`). Toujours
 *   proposée, et toujours EN DERNIER (groupe « Annonces ») : elle ne prend jamais la place d'une page du
 *   menu sous Entrée, et une saisie qui ne trouve aucune page n'est plus une impasse.
 * - Cible `publique` : la coque la localise (`hrefLocalise`), comme toute page du site.
 */
export function avecLaRechercheDAnnonces(
  resultats: readonly OptionDeLaPalette[],
  requete: string,
  l: LibellesDesAnnonces,
): OptionDeLaPalette[] {
  const texte = requete.trim();
  if (texte === '') {
    const dejaAuMenu = resultats.some((o) => o.cible.type === 'lien' && o.cible.href === CHEMIN_DES_ANNONCES);
    if (dejaAuMenu) return [...resultats];
    const option: OptionDeLaPalette = {
      cle: 'actions:annonces',
      groupe: 'actions',
      libelle: l.generique,
      precision: l.sitePublic,
      motsCles: [],
      icone: Search,
      cible: { type: 'lien', href: CHEMIN_DES_ANNONCES, publique: true },
    };
    const apres = resultats.findLastIndex((o) => o.groupe === 'actions') + 1;
    return [...resultats.slice(0, apres), option, ...resultats.slice(apres)];
  }
  const params = new URLSearchParams({ [parametreDe('q')]: texte });
  return [
    ...resultats,
    {
      cle: 'annonces:texte',
      groupe: 'annonces',
      libelle: l.avecTexte(texte),
      motsCles: [],
      icone: Search,
      cible: { type: 'lien', href: `${CHEMIN_DES_ANNONCES}?${params.toString()}`, publique: true },
    },
  ];
}
