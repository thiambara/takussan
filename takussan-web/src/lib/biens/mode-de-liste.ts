/**
 * TCK-2638 — les deux modes de la liste des biens, « Gestion » (occupation, état du mois) et
 * « Annonces » (en ligne, vues). Changer de mode est une VUE : la recherche, les filtres et la page
 * restent dans l'URL, seul `mode` change.
 *
 * Le mode se lit dans l'URL (un lien garde le mode), sinon dans la mémoire de l'appareil — un
 * cookie et non `localStorage` : la page est un composant serveur, qui le lit au rendu sans écart
 * d'hydratation —, sinon c'est « Gestion ». Un compte qui n'a aucun bien à louer n'a que les annonces.
 */

export const MODES_DE_LISTE = ['gestion', 'annonces'] as const;
export type ModeDeListe = (typeof MODES_DE_LISTE)[number];

/** La mémoire de l'appareil : un an, la page entière de l'application. */
export const COOKIE_MODE_BIENS = 'takussan_biens_mode';
export const DUREE_COOKIE_MODE_BIENS = 60 * 60 * 24 * 365;

function estUnMode(valeur: string | null | undefined): valeur is ModeDeListe {
  return valeur === 'gestion' || valeur === 'annonces';
}

/** Le cookie du mode choisi, borné à la liste des biens (patron de `cookieDuModeIcones`, TCK-2480). */
export function cookieDuModeDeListe(mode: ModeDeListe, securise: boolean): string {
  const cookie = `${COOKIE_MODE_BIENS}=${mode}; path=/app/properties; max-age=${DUREE_COOKIE_MODE_BIENS}; samesite=lax`;
  return securise ? `${cookie}; secure` : cookie;
}

export function ecrireModeDeListe(mode: ModeDeListe): void {
  document.cookie = cookieDuModeDeListe(mode, window.location.protocol === 'https:');
}

export function resoudreMode({
  url,
  memoire,
  gestionProposee,
}: {
  readonly url: string | null | undefined;
  readonly memoire: string | null | undefined;
  readonly gestionProposee: boolean;
}): ModeDeListe {
  if (!gestionProposee) return 'annonces';
  if (estUnMode(url)) return url;
  if (estUnMode(memoire)) return memoire;
  return 'gestion';
}

/**
 * TCK-2638 (lot B, décision 4 a) — le sélecteur n'est proposé qu'à un portefeuille qui a des biens À
 * LOUER (occupés + vacants, `Property::scopeForRent()`) ; sinon la liste n'a que ses annonces.
 */
export function gestionProposee(resume: { readonly occupied: number; readonly vacant: number }): boolean {
  return resume.occupied + resume.vacant > 0;
}

/** La requête de l'autre mode : tout est gardé, seul `mode` change. */
export function requeteDuMode(params: URLSearchParams, mode: ModeDeListe): string {
  const suivante = new URLSearchParams(params);
  suivante.set('mode', mode);
  return suivante.toString();
}

/**
 * Les pastilles du mode Gestion, comptées par `portfolio-summary` (TCK-2637) : chacune est un filtre
 * de la liste (`filter[occupancy]`, `filter[rent_late]`), et son compte est la clé du résumé.
 *
 * TCK-2638 — « À vendre » (`not_rental`, compté par `for_sale`) n'est proposée que lorsque le
 * portefeuille a des biens hors location, ou qu'elle est la pastille active
 * ({@link pastilleGestionProposee}) : un portefeuille tout en location garde les pastilles d'avant.
 */
export const PASTILLES_GESTION = [
  { cle: 'tous', compte: 'total', params: {} },
  { cle: 'occupes', compte: 'occupied', params: { occupancy: 'occupied' } },
  { cle: 'vacants', compte: 'vacant', params: { occupancy: 'vacant' } },
  { cle: 'retard', compte: 'rent_late', params: { rent_late: '1' } },
  { cle: 'preavis', compte: 'notice', params: { occupancy: 'notice' } },
  { cle: 'aVendre', compte: 'for_sale', params: { occupancy: 'not_rental' } },
] as const satisfies readonly {
  readonly cle: string;
  readonly compte: string;
  readonly params: Readonly<Record<string, string>>;
}[];

export type PastilleGestion = (typeof PASTILLES_GESTION)[number]['cle'];

const PARAMS_DES_PASTILLES = ['occupancy', 'rent_late'] as const;

export function pastilleGestionActive(params: URLSearchParams): PastilleGestion {
  if (params.get('rent_late') === '1') return 'retard';
  switch (params.get('occupancy')) {
    case 'occupied':
      return 'occupes';
    case 'vacant':
      return 'vacants';
    case 'notice':
      return 'preavis';
    case 'not_rental':
      return 'aVendre';
    default:
      return 'tous';
  }
}

/** « À vendre » ne s'affiche que s'il y a des biens hors location, ou si elle est active ; les autres toujours. */
export function pastilleGestionProposee(cle: PastilleGestion, aVendre: number, active: PastilleGestion): boolean {
  return cle !== 'aVendre' || aVendre > 0 || active === 'aVendre';
}

/** La requête d'une pastille : elle remplace la précédente, garde le reste, repart de la page 1. */
export function requeteDeLaPastille(params: URLSearchParams, cle: PastilleGestion): string {
  const suivante = new URLSearchParams(params);
  for (const nom of PARAMS_DES_PASTILLES) suivante.delete(nom);
  suivante.delete('page');
  suivante.delete(PARAM_VOIR);
  const pastille = PASTILLES_GESTION.find((p) => p.cle === cle);
  const ajouts: Readonly<Record<string, string>> = pastille?.params ?? {};
  for (const [nom, valeur] of Object.entries(ajouts)) suivante.set(nom, valeur);
  return suivante.toString();
}

/**
 * TCK-2638 (lot B) — les pastilles du mode Annonces : « Toutes » (décision du porteur, 1 a : le mode
 * reste une vue, comme « Tous » en Gestion), puis la partition de `filter[listing]` (2 a), comptée par
 * `portfolio-summary` : `online + pending_validation + drafts + offline = total`.
 */
export const PASTILLES_ANNONCES = [
  { cle: 'toutes', compte: 'total', params: {} },
  { cle: 'enLigne', compte: 'online', params: { listing: 'online' } },
  { cle: 'aValider', compte: 'pending_validation', params: { listing: 'pending' } },
  { cle: 'brouillons', compte: 'drafts', params: { listing: 'draft' } },
  { cle: 'horsLigne', compte: 'offline', params: { listing: 'offline' } },
] as const satisfies readonly {
  readonly cle: string;
  readonly compte: string;
  readonly params: Readonly<Record<string, string>>;
}[];

/**
 * Les onglets du bureau : les pastilles, puis « Vendus, loués » et « Archivés » (la maquette, et les
 * tuiles d'avant), qui sont des filtres de statut — « Archivés » inclut les archives.
 */
export const ONGLETS_ANNONCES = [
  ...PASTILLES_ANNONCES,
  { cle: 'vendusLoues', compte: 'sold_or_rented', params: { status: 'sold,rented' } },
  { cle: 'archives', compte: 'archived', params: { status: 'archived', include_archived: '1' } },
] as const;

export type PastilleAnnonces = (typeof ONGLETS_ANNONCES)[number]['cle'];

const ETAT_D_ANNONCE: Readonly<Record<string, PastilleAnnonces>> = {
  online: 'enLigne',
  pending: 'aValider',
  draft: 'brouillons',
  offline: 'horsLigne',
};

export function pastilleAnnoncesActive(params: URLSearchParams): PastilleAnnonces {
  const etat = ETAT_D_ANNONCE[params.get('listing') ?? ''];
  if (etat) return etat;
  if (params.get('status') === 'sold,rented') return 'vendusLoues';
  if (params.get('status') === 'archived') return 'archives';
  return 'toutes';
}

/**
 * La requête d'une pastille (ou d'un onglet) du mode Annonces : elle remplace la précédente — un
 * onglet de statut quitté retire son statut —, garde le reste, repart de la page 1.
 */
export function requeteDeLaPastilleAnnonces(params: URLSearchParams, cle: PastilleAnnonces): string {
  const suivante = new URLSearchParams(params);
  const active = pastilleAnnoncesActive(params);
  suivante.delete('listing');
  suivante.delete('page');
  suivante.delete(PARAM_VOIR);
  if (active === 'vendusLoues' || active === 'archives') suivante.delete('status');
  if (active === 'archives') suivante.delete('include_archived');
  const onglet = ONGLETS_ANNONCES.find((o) => o.cle === cle);
  const ajouts: Readonly<Record<string, string>> = onglet?.params ?? {};
  for (const [nom, valeur] of Object.entries(ajouts)) suivante.set(nom, valeur);
  return suivante.toString();
}

/**
 * TCK-2638 — les paramètres PROPRES à un mode : changer de mode les garde dans l'URL (un retour les
 * retrouve, AC4), mais l'autre mode ne les applique pas, et ils n'y font pas d'un portefeuille vide un
 * « filtre sans résultat ».
 */
export const PARAMS_DU_MODE: Readonly<Record<ModeDeListe, readonly string[]>> = {
  gestion: ['occupancy', 'rent_late', 'tenant'],
  annonces: ['listing'],
};

/** Les paramètres d'URL qui ne filtrent pas la liste du mode `mode`. */
export function parametresSansFiltre(mode: ModeDeListe): ReadonlySet<string> {
  const autre: ModeDeListe = mode === 'gestion' ? 'annonces' : 'gestion';
  return new Set(['page', 'sort', 'per_page', 'mode', PARAM_VOIR, ...PARAMS_DU_MODE[autre]]);
}

/**
 * TCK-2638 — au téléphone, « Afficher les 20 suivants » (maquette `app-biens` a-0 et a-1, décision de la
 * session) : la liste s'allonge, la page reste la première. `voir` est le nombre de biens montrés, de 20
 * en 20, jusqu'à 100 (la borne de `per_page` de l'API) ; au-delà, la pagination reprend.
 */
export const PARAM_VOIR = 'voir';
export const PAS_DES_SUIVANTS = 20;
export const VOIR_MAX = 100;

/** `voir` lu dans l'URL : un multiple de 20 entre 40 et 100, sinon rien. */
export function lireVoir(valeur: string | null | undefined): number | undefined {
  const n = Number.parseInt(valeur ?? '', 10);
  return Number.isInteger(n) && n > PAS_DES_SUIVANTS && n <= VOIR_MAX && n % PAS_DES_SUIVANTS === 0 ? n : undefined;
}

/** La requête qui montre les 20 suivants : `voir` grandit, la page repart de la première. */
export function requeteDesSuivants(params: URLSearchParams, affiches: number): string {
  const suivante = new URLSearchParams(params);
  suivante.delete('page');
  suivante.delete('per_page');
  const voir = Math.min((Math.floor(affiches / PAS_DES_SUIVANTS) + 1) * PAS_DES_SUIVANTS, VOIR_MAX);
  if (voir > PAS_DES_SUIVANTS) suivante.set(PARAM_VOIR, String(voir));
  else suivante.delete(PARAM_VOIR);
  return suivante.toString();
}

/**
 * Le téléphone propose-t-il « Afficher les 20 suivants » ? Sur la première page, quand il en reste, sous
 * la borne de 100 ; sinon il garde la pagination (Précédent / Suivant), et jamais les deux.
 */
export function suivantsProposes(meta: { readonly current_page: number; readonly per_page: number; readonly total: number }): boolean {
  return meta.current_page === 1 && meta.total > meta.per_page && meta.per_page < VOIR_MAX;
}
