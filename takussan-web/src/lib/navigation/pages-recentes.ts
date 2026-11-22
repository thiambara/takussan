/**
 * TCK-2482 (A8) — les pages de `/app` ouvertes sur CET appareil, que la palette de commandes propose sous
 * « Récents ». Patron : `src/lib/recherches-recentes.ts` (TCK-2475).
 *
 * TCK-2846 — **des fiches, plus seulement des sections.** Une fiche ouverte (un bien, une demande, un
 * bail…) est retenue sous SON nom et son type (« Villa 4 chambres à Ngor · Bien ») par la fiche elle-même
 * (`retenirFiche`, composant `RetenirLaFiche`) ; la coque ne retient plus que les pages qui SONT une entrée
 * du menu (une liste, un tableau de bord : `retenirPage`), rendues sous le nom de l'entrée. Une fiche n'est
 * donc jamais réduite à sa section (« Baux », « Commissions »). Un seul magasin, une seule lecture
 * (`lirePagesRecentes`) pour la palette, la colonne/le tiroir et la page introuvable (`recentsResolus`).
 *
 * - Par compte (`takussan.pages-recentes.<id>`) ET par espace actif (une liste par identifiant de profil
 *   dans la valeur) : une fiche de l'agence A n'apparaît pas dans les récents de l'espace B. Espace
 *   inconnu : aucun récent, jamais une liste commune.
 * - Vidées à la déconnexion (`oublierLesPagesRecentes`, `AuthContext.logout`).
 * - Une fiche qui n'est plus lisible (introuvable) est retirée par la page introuvable (`oublierPage`).
 * - Données personnelles : on ne retient que le chemin, le type, l'identifiant et le titre affiché — et
 *   un titre qui ressemble à un téléphone ou à un courriel n'est PAS retenu (`titreRetenable`).
 * - L'ancienne valeur (TCK-2482 : un tableau de chemins, sans espace) est ignorée sans erreur, et
 *   remplacée à la première écriture.
 * - Rien ne quitte le navigateur. Tout accès au stockage est enveloppé : en navigation privée, sous quota
 *   ou stockage bloqué, `localStorage` lève — la coque fonctionne alors sans récents.
 * - Nommées par la politique de confidentialité (`src/content/legal/privacy.ts`, § 8).
 */
export const PAGES_RECENTES_MAX = 8;

const PREFIXE = 'takussan.pages-recentes.';

/** Écrit après chaque écriture : les lecteurs du même onglet (la colonne) relisent sans attendre `storage`. */
export const EVENEMENT_PAGES_RECENTES = 'takussan:pages-recentes';

/** TCK-2846 — les types de fiche, libellés sous `nav.recents.types.<type>`. */
export const TYPES_DE_FICHE = [
  'bien',
  'demande',
  'client',
  'bail',
  'intervention',
  'visite',
  'reservation',
  'bailleur',
] as const;
export type TypeDeFiche = (typeof TYPES_DE_FICHE)[number];

export interface PageDuMenuRecente {
  readonly chemin: string;
}

export interface FicheRecente {
  readonly chemin: string;
  readonly type: TypeDeFiche;
  readonly id: string;
  readonly titre: string;
}

export type PageRecente = PageDuMenuRecente | FicheRecente;

export function estUneFiche(page: PageRecente): page is FicheRecente {
  return 'type' in page;
}

interface Magasin {
  readonly v: 2;
  readonly espaces: Record<string, readonly PageRecente[]>;
}

export function clePagesRecentes(compte: number | string): string {
  return `${PREFIXE}${compte}`;
}

function estUnCheminDeLApp(chemin: unknown): chemin is string {
  return typeof chemin === 'string' && (chemin === '/app' || chemin.startsWith('/app/') || chemin.startsWith('/app?'));
}

/** `/app/leads?ouverte=12` → `/app/leads`. */
export function sansRequete(chemin: string): string {
  const i = chemin.indexOf('?');
  return i === -1 ? chemin : chemin.slice(0, i);
}

const TITRE_MAX = 80;
const COURRIEL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
/** Un titre qui n'est qu'un numéro (`+221 77 123 45 67`, `771234567`). */
const NUMERO_SEUL = /^\+?[\d\s().-]{7,}$/;
/** Un portable sénégalais dans un texte (« Visite de 77 123 45 67 »). */
const PORTABLE = /(?:^|\D)(?:\+?221[\s.-]?)?7[05678][\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}(?:\D|$)/;

/**
 * TCK-2846 (AC5) — le titre d'une fiche peut-il être gardé sur l'appareil ? Jamais un courriel ni un
 * téléphone : le nom d'un client sans nom retombe parfois sur l'un ou l'autre. Rend le titre nettoyé,
 * ou `null` — la fiche n'est alors pas retenue.
 */
export function titreRetenable(titre: string | null | undefined): string | null {
  const net = (titre ?? '').replace(/\s+/g, ' ').trim();
  if (net === '' || COURRIEL.test(net) || NUMERO_SEUL.test(net) || PORTABLE.test(net)) return null;
  return net.length > TITRE_MAX ? `${net.slice(0, TITRE_MAX - 1)}…` : net;
}

function pageLue(brute: unknown): PageRecente | null {
  if (typeof brute !== 'object' || brute === null) return null;
  const { chemin, type, id, titre } = brute as Record<string, unknown>;
  if (!estUnCheminDeLApp(chemin)) return null;
  if (type === undefined) return { chemin };
  if (!(TYPES_DE_FICHE as readonly unknown[]).includes(type) || typeof id !== 'string') return null;
  const propre = typeof titre === 'string' ? titreRetenable(titre) : null;
  return propre === null ? null : { chemin, type: type as TypeDeFiche, id, titre: propre };
}

function lireMagasin(compte: number | string): Magasin {
  const vide: Magasin = { v: 2, espaces: {} };
  try {
    const brut = window.localStorage.getItem(clePagesRecentes(compte));
    if (!brut) return vide;
    const lu: unknown = JSON.parse(brut);
    // L'ancienne forme (un tableau de chemins) ou toute autre : ignorée, sans erreur.
    if (typeof lu !== 'object' || lu === null || Array.isArray(lu)) return vide;
    const espaces = (lu as { espaces?: unknown }).espaces;
    if (typeof espaces !== 'object' || espaces === null) return vide;
    const propres: Record<string, readonly PageRecente[]> = {};
    for (const [espace, liste] of Object.entries(espaces)) {
      if (!Array.isArray(liste)) continue;
      propres[espace] = liste.map(pageLue).filter((p): p is PageRecente => p !== null).slice(0, PAGES_RECENTES_MAX);
    }
    return { v: 2, espaces: propres };
  } catch {
    return vide;
  }
}

function ecrire(compte: number | string, espace: string, pages: readonly PageRecente[]): void {
  const magasin = lireMagasin(compte);
  const suivant: Magasin = { v: 2, espaces: { ...magasin.espaces, [espace]: pages.slice(0, PAGES_RECENTES_MAX) } };
  try {
    window.localStorage.setItem(clePagesRecentes(compte), JSON.stringify(suivant));
  } catch {
    /* quota, navigation privée : la page n'est simplement pas retenue */
    return;
  }
  window.dispatchEvent(new Event(EVENEMENT_PAGES_RECENTES));
}

/**
 * TCK-2846 — l'espace d'un compte SANS profil (client, locataire : aucun profil de premier niveau, l'API
 * lie `null`) : un seul espace, le compte lui-même. Posé par le layout, qui seul sait que l'espace a été
 * résolu ; une coque montée sans espace (tests, autre surface) reste sans récents.
 */
export const ESPACE_DU_COMPTE = 'compte';

/** L'identifiant lié par le layout (`profilLieDeLaCoque`) → la clé d'espace des récents. */
export function espaceDesRecents(profilLie: string | null | undefined): string {
  return profilLie || ESPACE_DU_COMPTE;
}

/** L'espace de la coque (`agency_admin:12`), ou rien : sans espace connu, ni lecture ni écriture. */
type Espace = string | null | undefined;

function utilisable(espace: Espace): espace is string {
  return typeof window !== 'undefined' && typeof espace === 'string' && espace !== '';
}

/** Les récents de l'espace, le plus récent d'abord ; `[]` sans espace connu ou sans stockage. */
export function lirePagesRecentes(compte: number | string, espace: Espace): PageRecente[] {
  if (!utilisable(espace)) return [];
  return [...(lireMagasin(compte).espaces[espace] ?? [])];
}

/**
 * Une page du MENU visitée (la coque, `useRetenirLaPageRecente`) : en tête, sans doublon. Un chemin
 * qu'une fiche tient déjà n'est ni ajouté ni déplacé — la fiche reste nommée par son titre.
 */
export function retenirPage(compte: number | string, espace: Espace, chemin: string): void {
  if (!utilisable(espace) || !estUnCheminDeLApp(chemin)) return;
  const actuelles = lirePagesRecentes(compte, espace);
  if (actuelles.some((p) => estUneFiche(p) && p.chemin === chemin)) return;
  // La fiche la plus récente est celle de CETTE page (`/app/leads?ouverte=9` sur `/app/leads`) : la
  // visite est la sienne. La fiche écrit avant la coque quand les deux montent ensemble (un effet
  // d'enfant passe avant celui du parent) ; sans cette règle, « Demandes » repassait devant elle.
  const tete = actuelles[0];
  if (tete && estUneFiche(tete) && sansRequete(tete.chemin) === chemin) return;
  ecrire(compte, espace, [{ chemin }, ...actuelles.filter((p) => p.chemin !== chemin)]);
}

/**
 * TCK-2846 — « cette fiche a été ouverte » : en tête, dédoublonnée par entité (type + identifiant) et par
 * chemin. La page du menu de son propre chemin (`/app/leads` pour `/app/leads?ouverte=12`) est retirée :
 * la visite est celle de la fiche, pas de la section. Un titre non retenable (courriel, téléphone) : rien.
 */
export function retenirFiche(
  compte: number | string,
  espace: Espace,
  fiche: { readonly chemin: string; readonly type: TypeDeFiche; readonly id: string | number; readonly titre: string | null | undefined },
): void {
  if (!utilisable(espace) || !estUnCheminDeLApp(fiche.chemin)) return;
  const titre = titreRetenable(fiche.titre);
  if (titre === null) return;
  const id = String(fiche.id);
  const section = sansRequete(fiche.chemin);
  const gardees = lirePagesRecentes(compte, espace).filter((p) =>
    estUneFiche(p) ? !(p.type === fiche.type && p.id === id) && p.chemin !== fiche.chemin : p.chemin !== section,
  );
  ecrire(compte, espace, [{ chemin: fiche.chemin, type: fiche.type, id, titre }, ...gardees]);
}

/** TCK-2846 — une fiche introuvable sort des récents, sans erreur affichée. */
export function oublierPage(compte: number | string, espace: Espace, chemin: string): void {
  if (!utilisable(espace)) return;
  const actuelles = lirePagesRecentes(compte, espace);
  const gardees = actuelles.filter((p) => p.chemin !== chemin);
  if (gardees.length !== actuelles.length) ecrire(compte, espace, gardees);
}

/** TCK-2846 — à la déconnexion : la clé de chaque compte de l'appareil disparaît. */
export function oublierLesPagesRecentes(): void {
  if (typeof window === 'undefined') return;
  try {
    const cles: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const cle = window.localStorage.key(i);
      if (cle?.startsWith(PREFIXE)) cles.push(cle);
    }
    for (const cle of cles) window.localStorage.removeItem(cle);
  } catch {
    /* stockage bloqué : rien n'y a été écrit */
  }
}
