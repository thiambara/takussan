import { decouperLocale } from '@/i18n/routing';
import type { IdDestination } from './catalogue';
import type { EntreeComposee } from './composer-menu';
import { DISPOSITIONS } from './dispositions';
import { ongletsDuMenu } from './onglets';
import type { Persona } from './personas';

/**
 * TCK-2493 / TCK-2494 (ADR-0091) — la navigation du SITE PUBLIC dérivée du persona.
 *
 * La disposition d'ADR-0089 (`DISPOSITIONS`) a deux lecteurs : la coque de `/app` et le site public.
 * Ce module ne déclare AUCUNE destination : il choisit, dans le menu composé du persona, ce que la
 * barre d'onglets publique, l'écran « Moi » et le menu « Mon espace » montrent. Un persona ajouté à
 * `DISPOSITIONS` a donc sa barre publique sans autre écriture (ADR-0091 §2).
 */

/**
 * La plage où la barre d'onglets publique existe : le complément exact de `lg:hidden`
 * (`@media (width >= 64rem)`, Tailwind 4). En `rem`, comme `REQUETE_DE_LA_BARRE` de `/app` : dans une
 * media query, `rem` suit la taille de police par défaut du navigateur, un réglage d'accessibilité.
 */
export const REQUETE_BARRE_PUBLIQUE = '(width < 64rem)';

/** Le persona du site public : un persona de `/app`, ou personne. */
export type PersonaPublic = Persona | 'anonyme';

/**
 * Ce que la barre publique ne montre jamais en case 2-3 : le tableau de bord (c'est « Moi » qui
 * ouvre l'espace), la messagerie (case 4, toujours) et la recherche (case 1, « Explorer »).
 */
const HORS_DES_CASES: ReadonlySet<string> = new Set(['tableau-de-bord', 'messagerie', 'chercher-bien']);

interface GroupeDEntrees<E> {
  readonly id: string;
  readonly titre?: string | null;
  readonly replie?: boolean;
  readonly entrees: readonly E[];
}

type EntreeJugee = EntreeComposee & { readonly locked?: boolean };

function sansLesCasesFixes<E extends EntreeJugee>(groupes: readonly GroupeDEntrees<E>[]): GroupeDEntrees<E>[] {
  return groupes.map((g) => ({ ...g, entrees: g.entrees.filter((e) => !HORS_DES_CASES.has(e.id)) }));
}

/**
 * ADR-0091 §2 — les cases 2 et 3 du persona : les deux premiers `onglets` de sa disposition, hors
 * tableau de bord et messagerie, lus par `ongletsDuMenu` — la fonction de la barre de `/app`. Une
 * case que le menu du persona ne rend pas cède sa place à la destination suivante de sa
 * disposition, jamais un cadenas. `groupes` : ceux de la DISPOSITION, sans préférences
 * (`groupesDeLaDisposition`) — une épingle range le menu, elle ne déplace pas un onglet.
 */
export function casesDuPersona<E extends EntreeJugee>(groupes: readonly GroupeDEntrees<E>[], persona: Persona): E[] {
  const declares = DISPOSITIONS[persona].onglets.filter((id) => !HORS_DES_CASES.has(id));
  return ongletsDuMenu(sansLesCasesFixes(groupes), declares).slice(0, 2);
}

/** Les groupes qui ne sont pas des sections de « Moi » : divulgations et épingles. */
const GROUPES_HORS_ESPACE: ReadonlySet<string> = new Set(['plus', 'aussi', 'epingles']);

/** Ce que « Moi » et « Mon espace » rangent à part, sous « Mes recherches », quand le menu les a sous « Plus ». */
const RECHERCHES: readonly IdDestination[] = ['favoris', 'recherches'];

/** Au plus six lignes de métier dans le menu « Mon espace », puis Messages (TCK-2494). */
export const LIGNES_DE_MON_ESPACE_AU_PLUS = 6;

export interface LignesDeMonEspace<E> {
  /** Les lignes de métier : les deux cases de la barre d'abord, puis le reste de la tête du menu. */
  readonly lignes: readonly E[];
  /** La messagerie, toujours en dernière ligne quand le menu la porte. */
  readonly messagerie: E | null;
  /** Favoris et recherches, quand aucune ligne ne les porte déjà. */
  readonly suite: readonly E[];
}

/**
 * TCK-2494 — les lignes du menu « Mon espace » de l'en-tête de bureau.
 *
 * La tête du menu du persona : ses groupes SANS TITRE et ses deux premiers groupes titrés dépliés —
 * le « métier » que la disposition place avant le tableau de bord (TCK-2489). Les deux cases de la
 * barre mobile passent en premier (le même ordre au téléphone et au bureau), puis le reste dans
 * l'ordre de la disposition, au plus {@link LIGNES_DE_MON_ESPACE_AU_PLUS} ; la messagerie ferme la
 * liste. Une destination que le persona n'ouvre pas n'y est jamais : ce sont les entrées du menu
 * composé, déjà jugées par le catalogue.
 */
export function lignesDeMonEspace<E extends EntreeJugee>(
  groupes: readonly GroupeDEntrees<E>[],
  persona: Persona,
): LignesDeMonEspace<E> {
  const sections = groupes.filter((g) => !GROUPES_HORS_ESPACE.has(g.id));
  let titres = 0;
  const tete = sections.filter((g) => {
    if (g.titre == null) return true;
    if (g.replie || titres >= 2) return false;
    titres += 1;
    return true;
  });
  const cases = casesDuPersona(groupes, persona);
  const vues = new Set<string>(cases.map((e) => e.id));
  const reste: E[] = [];
  for (const g of tete) {
    for (const e of g.entrees) {
      if (e.locked || HORS_DES_CASES.has(e.id) || vues.has(e.id)) continue;
      vues.add(e.id);
      reste.push(e);
    }
  }
  const lignes = [...cases, ...reste].slice(0, LIGNES_DE_MON_ESPACE_AU_PLUS);
  const prises = new Set<string>(lignes.map((e) => e.id));
  const toutes = groupes.filter((g) => g.id !== 'aussi').flatMap((g) => g.entrees);
  const messagerie = toutes.find((e) => e.id === 'messagerie' && !e.locked) ?? null;
  const suite = RECHERCHES.flatMap((id) => {
    const e = toutes.find((x) => x.id === id && !x.locked);
    return e && !prises.has(e.id) ? [e] : [];
  });
  return { lignes, messagerie, suite };
}

export interface SectionDeMoi<E> {
  readonly id: string;
  /** Clé sous `nav.sidebar.groupes`, ou `null`. */
  readonly titre: string | null;
  readonly entrees: readonly E[];
}

/**
 * TCK-2493 (ADR-0091 §3) — les sections de l'écran « Moi » : les groupes de la disposition du persona,
 * dans leur ordre, sans le tableau de bord (« Ouvrir mon espace » y mène) ni la recherche (« Explorer »
 * est la case 1) ; puis « Mes recherches » avec favoris et recherches quand ils ne sont que sous
 * « Plus » — ce qui quitte la barre pour un pro y reste atteignable.
 */
export function sectionsDeMoi<E extends EntreeJugee>(groupes: readonly GroupeDEntrees<E>[]): SectionDeMoi<E>[] {
  const sections: SectionDeMoi<E>[] = [];
  const vues = new Set<string>();
  for (const g of groupes) {
    if (GROUPES_HORS_ESPACE.has(g.id)) continue;
    const entrees = g.entrees.filter((e) => !e.locked && e.id !== 'tableau-de-bord' && e.id !== 'chercher-bien');
    entrees.forEach((e) => vues.add(e.id));
    if (entrees.length > 0) sections.push({ id: g.id, titre: g.titre ?? null, entrees });
  }
  const plus = groupes.find((g) => g.id === 'plus')?.entrees ?? [];
  const recherches = RECHERCHES.flatMap((id) => {
    const e = plus.find((x) => x.id === id && !x.locked);
    return e && !vues.has(e.id) ? [e] : [];
  });
  if (recherches.length > 0) sections.push({ id: 'mes-recherches', titre: 'mesRecherches', entrees: recherches });
  return sections;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Où la barre vit — ADR-0091 §4 : une seule couche d'action en bas de l'écran à la fois
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** Les segments du chemin public, langue retirée ; `null` hors du site public (pas de préfixe de langue). */
function segmentsPublics(pathname: string | null | undefined): string[] | null {
  if (!pathname) return null;
  const { locale, chemin } = decouperLocale(pathname);
  if (locale === null) return null;
  return chemin.split('/').filter(Boolean);
}

/** Le chemin porte un préfixe de langue : c'est une page du site public (ADR-0026). */
export function estSurLeSitePublic(pathname: string | null | undefined): boolean {
  return segmentsPublics(pathname) !== null;
}

/**
 * Les pages publiques où une AUTRE couche d'action tient le bas de l'écran, ou qui sont des impasses
 * volontaires : la fiche d'un bien (sa barre d'actions), les tunnels (paiement, revendication,
 * réservation), les pages ouvertes par un lien (partage, confirmation ou désabonnement d'une alerte),
 * et les maquettes. La carte plein écran de la liste, qui n'a pas d'URL, se masque par CSS
 * (`globals.css`, `.takussan-carte-plein-ecran`).
 */
const PREMIERS_SEGMENTS_SANS_BARRE: ReadonlySet<string> = new Set([
  'pay',
  'claim',
  'bookings',
  'share',
  'search-alerts',
  'notifications',
  'playground',
]);

/** TCK-2493 — la barre d'onglets publique (et la pastille du comparateur) se montre-t-elle ici ? */
export function porteLaBarrePublique(pathname: string | null | undefined): boolean {
  const segments = segmentsPublics(pathname);
  if (segments === null) return false;
  const [premier, second] = segments;
  if (premier === undefined) return true;
  if (PREMIERS_SEGMENTS_SANS_BARRE.has(premier)) return false;
  // La fiche d'un bien et tout ce qui vit sous elle — jamais la liste (`/properties`).
  if (premier === 'properties' && second !== undefined) return false;
  return true;
}

/**
 * TCK-2494 — les pages de DÉCOUVERTE : l'accueil et la liste des biens. Seules à garder la rangée de
 * catégories dans l'en-tête de bureau ; la fiche et les pages d'outils ne l'ont plus.
 */
export function estPageDeDecouverte(pathname: string | null | undefined): boolean {
  const segments = segmentsPublics(pathname);
  if (segments === null) return false;
  return segments.length === 0 || (segments.length === 1 && segments[0] === 'properties');
}

/** Le chemin de l'écran « Compte » (anonyme) / « Moi » (connecté), case 5 de la barre. */
export const HREF_COMPTE = '/account';

/** Le paramètre de `/account` qui porte la page quittée (chemin ET requête), pour la connexion. */
export const PARAM_DEPUIS = 'depuis';

/**
 * Le lien de la case « Compte » : il emporte la page quittée, pour que « Se connecter » y ramène
 * (TCK-568 : le lien « Connexion » du menu mobile le faisait, la case 5 le remplace). Nu depuis
 * l'accueil — on s'y connecte pour aller à son espace — et depuis `/account` lui-même.
 */
export function hrefDuCompte(cheminCourant: string | null | undefined): string {
  const chemin = (cheminCourant ?? '').split(/[?#]/)[0] ?? '';
  const segments = segmentsPublics(chemin);
  if (segments === null || segments.length === 0 || `/${segments.join('/')}` === HREF_COMPTE) return HREF_COMPTE;
  return `${HREF_COMPTE}?${PARAM_DEPUIS}=${encodeURIComponent(cheminCourant ?? '')}`;
}

/**
 * Le libellé court que le site public donne à une destination, clé sous `navigationPublique.onglets`,
 * ou `null` (le libellé de son entrée de menu). « Loyer » pour les paiements DU LOCATAIRE seulement :
 * ceux du bailleur sont ses encaissements (« Finances »). Lu par la barre, « Moi » et « Mon espace »,
 * pour qu'une même destination porte le même nom au téléphone et au bureau.
 */
export function libellePublic(id: string, persona: Persona): string | null {
  return id === 'paiements' && persona === 'locataire' ? 'loyer' : null;
}
