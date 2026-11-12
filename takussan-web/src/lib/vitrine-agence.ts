/**
 * TCK-2524 — la vitrine de la fiche publique d'agence, écrite depuis la console : l'accroche, les
 * trois « Pourquoi nous », la sélection de six biens publics au plus — et l'aperçu de la couverture
 * qui en résulte.
 *
 * Le contrat est celui de TCK-2518 (`AgencyUpdateRequest`) : `tagline` ≤ 120, `highlights` trois
 * chaînes ≤ 80, `showcase_property_ids` six biens de l'agence au plus, dans l'ordre choisi ; tout est
 * facultatif et `null` vide le champ. Ce module ne porte que des fonctions pures : le composant
 * (`fiche/SectionFichePublique`, TCK-2670) n'a ni règle ni calcul à lui.
 */

export const MAX_ACCROCHE = 120;
export const MAX_POINT = 80;
export const NB_POINTS = 3;
export const MAX_BIENS_VITRINE = 6;
/** `AgencyShowcase::COVER_SIZE` — trois photos. */
export const TAILLE_COUVERTURE = 3;
/** `AgencyShowcase::RECENT_CANDIDATES` — les biens récents que l'API essaie après la sélection. */
const CANDIDATS_RECENTS = 9;

/** Un bien public de l'agence, tel que la liste de la console le rend. */
export interface BienDeVitrine {
  readonly id: number;
  readonly title: string | null;
  readonly reference_number?: string | null;
  readonly main_photo_url: string | null;
}

/**
 * Coche ou décoche un bien. Un septième est REFUSÉ : la sélection rendue est la même référence, et
 * l'appelant le sait par `===`. Rien ne part donc jamais avec sept biens.
 */
export function basculerBien(selection: readonly number[], id: number): readonly number[] {
  if (selection.includes(id)) return selection.filter((x) => x !== id);
  if (selection.length >= MAX_BIENS_VITRINE) return selection;
  return [...selection, id];
}

/** Monte (`-1`) ou descend (`1`) un bien d'un cran ; aux bords, rien ne bouge. */
export function deplacerBien(selection: readonly number[], id: number, sens: -1 | 1): readonly number[] {
  const i = selection.indexOf(id);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= selection.length) return selection;
  const suivante = [...selection];
  [suivante[i], suivante[j]] = [suivante[j], suivante[i]];
  return suivante;
}

/**
 * La couverture que la fiche publique montrera — la règle d'`AgencyShowcase::covers()` : trois
 * photos de biens PUBLICS, la sélection d'abord (dans son ordre), puis les plus récents ; un bien
 * sans photo est sauté, un bien hors de la liste publique aussi.
 *
 * `biensPublics` arrive dans l'ordre de l'API (`published_at DESC, created_at DESC, id DESC`) :
 * c'est l'ordre « plus récents » de la couverture.
 */
export function couvertureApercue(
  selection: readonly number[],
  biensPublics: readonly BienDeVitrine[],
  selectionNommee: readonly BienDeVitrine[] = [],
): BienDeVitrine[] {
  // Revue de TCK-2524 — un bien choisi au-delà de la page reçue se trouve dans `selectionNommee` (lue par
  // ses ids, au même prédicat public) : il reste en tête de couverture.
  const parId = new Map([...biensPublics, ...selectionNommee].map((b) => [b.id, b]));
  const candidats = [...selection, ...biensPublics.slice(0, CANDIDATS_RECENTS).map((b) => b.id)];
  const couverture: BienDeVitrine[] = [];
  for (const id of new Set(candidats)) {
    const bien = parId.get(id);
    if (!bien?.main_photo_url) continue;
    couverture.push(bien);
    if (couverture.length === TAILLE_COUVERTURE) break;
  }
  return couverture;
}

export interface SaisieVitrine {
  readonly accroche: string;
  readonly points: readonly string[];
  readonly selection: readonly number[];
}

export interface ChargeUtileVitrine {
  readonly tagline: string | null;
  readonly highlights: string[] | null;
  readonly showcase_property_ids: number[] | null;
}

/**
 * Ce qui part à l'API. Un champ vidé part à `null` : « vider un champ le retire de la fiche ». Les
 * lignes vides des « Pourquoi nous » sont retirées (`highlights.*` est `required`) — d'où
 * `indexDesPoints` : le k-ième point envoyé est la ligne `indexDesPoints[k]` de l'écran, pour reposer
 * un 422 `highlights.k` sur la bonne ligne quand une ligne du milieu est vide.
 */
export function chargeUtileVitrine(saisie: SaisieVitrine): {
  readonly payload: ChargeUtileVitrine;
  readonly indexDesPoints: readonly number[];
} {
  const accroche = saisie.accroche.trim();
  const indexDesPoints: number[] = [];
  const points: string[] = [];
  saisie.points.forEach((p, i) => {
    const texte = p.trim();
    if (texte === '') return;
    indexDesPoints.push(i);
    points.push(texte);
  });
  return {
    payload: {
      tagline: accroche === '' ? null : accroche,
      highlights: points.length === 0 ? null : points,
      showcase_property_ids: saisie.selection.length === 0 ? null : [...saisie.selection],
    },
    indexDesPoints,
  };
}

export type ChampVitrine = 'accroche' | 'point-0' | 'point-1' | 'point-2' | 'points' | 'selection';

/**
 * Un 422 de l'API reposé sur son champ : `tagline` → l'accroche, `highlights.k` → la ligne d'écran
 * du k-ième point envoyé, `highlights` → le groupe, `showcase_property_ids(.n)` → la sélection. Ce qui
 * ne vise aucun champ reste dans `autres` (bandeau).
 */
export function erreursVitrineSurLeurChamp(
  errors: Readonly<Record<string, readonly string[]>> | undefined,
  indexDesPoints: readonly number[],
): { readonly champs: Partial<Record<ChampVitrine, string>>; readonly autres: string[] } {
  const champs: Partial<Record<ChampVitrine, string>> = {};
  const autres: string[] = [];
  for (const [cle, messages] of Object.entries(errors ?? {})) {
    const message = messages?.[0];
    if (!message) continue;
    const point = /^highlights\.(\d+)$/.exec(cle);
    let champ: ChampVitrine | null = null;
    if (cle === 'tagline') champ = 'accroche';
    else if (cle === 'highlights') champ = 'points';
    else if (point) {
      const ligne = indexDesPoints[Number(point[1])];
      champ = ligne === undefined ? 'points' : (`point-${ligne}` as ChampVitrine);
    } else if (cle === 'showcase_property_ids' || cle.startsWith('showcase_property_ids.')) champ = 'selection';
    if (champ === null) autres.push(message);
    else champs[champ] ??= message;
  }
  return { champs, autres };
}

/** Les colonnes que le choix des biens affiche (`main_photo_url` est dérivé : toujours émis). */
export const VITRINE_PROPERTY_FIELDS = ['id', 'title', 'reference_number'] as const;

/** La page la plus large que l'API serve (`HasQueryBuilder::PER_PAGE_MAX`). */
export const BIENS_PUBLICS_PAR_PAGE = 100;

/**
 * Les biens que la fiche publique peut montrer : ceux de l'agence, au prédicat `publicPortfolio()`
 * (`filter[public]` = publiés au sens du catalogue, `filter[status]=available` = disponibles), dans
 * l'ordre « plus récents » de la couverture. Une recherche passe par `filter[search]`, jamais par un
 * filtre côté client sur une page déjà reçue.
 */
export function parametresDesBiensPublics(agencyId: number, recherche = '') {
  const texte = recherche.trim();
  return {
    fields: { properties: VITRINE_PROPERTY_FIELDS },
    filter: {
      agency_id: agencyId,
      public: 1,
      status: 'available',
      ...(texte === '' ? {} : { search: texte }),
    },
    sort: '-published_at,-created_at,-id',
    per_page: BIENS_PUBLICS_PAR_PAGE,
  };
}

/**
 * Revue de TCK-2524 — les biens de la SÉLECTION, lus par leurs ids (`filter[id]`), au même prédicat que
 * la liste : un bien choisi se nomme même au-delà des cent premiers, et un id que cette lecture ne rend
 * pas n'est plus montrable par la fiche (plus public, plus disponible, ou plus à l'agence).
 */
export function parametresDeLaSelection(agencyId: number, ids: readonly number[]) {
  const { filter, fields } = parametresDesBiensPublics(agencyId);
  return {
    fields,
    filter: { ...filter, id: [...ids].sort((a, b) => a - b).join(',') },
    per_page: MAX_BIENS_VITRINE,
  };
}

export const vitrineQueryKeys = {
  biensPublics: (agencyId: number, recherche: string) => ['agency', agencyId, 'vitrine', 'biens-publics', recherche.trim()] as const,
  selection: (agencyId: number, ids: readonly number[]) =>
    ['agency', agencyId, 'vitrine', 'selection', [...ids].sort((a, b) => a - b).join(',')] as const,
};

/**
 * Qui écrit la vitrine : la règle d'`AgencyPolicy::configure` — l'administrateur principal, ou qui
 * tient `agency.update` dans l'agence. La page `/app/agency` s'ouvre à tout rôle d'administration
 * (`PAGES_ADMIN`) : un administrateur à rôle restreint la voit, et le bloc ne lui est pas proposé
 * plutôt que de finir en 403. Capacités illisibles (`null`) : refusé — un écran réservé se refuse
 * quand on ne sait pas.
 */
export function peutEcrireLaVitrine(
  capacites: readonly string[] | null,
  agence: { readonly primary_admin_id?: number | null },
  userId: number,
): boolean {
  if (agence.primary_admin_id != null && agence.primary_admin_id === userId) return true;
  return capacites?.includes('agency.update') === true;
}
