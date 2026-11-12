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
  const pastille = PASTILLES_GESTION.find((p) => p.cle === cle);
  const ajouts: Readonly<Record<string, string>> = pastille?.params ?? {};
  for (const [nom, valeur] of Object.entries(ajouts)) suivante.set(nom, valeur);
  return suivante.toString();
}
