/**
 * TCK-2590 — l'état de la liste des clients, lu dans l'URL et traduit en lecture de l'API.
 *
 * Pur, sans directive : la page (composant serveur) le lit, les composants client l'écrivent.
 *
 *  · `vue` : `a-relancer` · `mes-clients` · `negociation` · `sans-referent` ; absente : « Tous ».
 *    Une vue est un filtre de l'API ({@link filtresDeLaVue}), jamais un tri côté client.
 *    « Sans référent » est la vue de l'admin ; les vues ne valent que pour le personnel.
 *  · `sort` : borné aux tris que l'API accepte sur une colonne (`TRIS_DES_COLONNES`). L'étape et le
 *    référent ne se trient pas : l'API rend 400 (relevé le 2026-11-12).
 *  · `per_page` : 10, 20 (défaut, absent de l'URL) ou 50 — transmis tel quel (TCK-2590 AC4).
 *  · `page`, `search`, `pipeline_stage`, `status`, `tags` : comme avant (TCK-042, TCK-093).
 */

export const VUES_DES_CLIENTS = ['a-relancer', 'mes-clients', 'negociation', 'sans-referent'] as const;
export type VueNommee = (typeof VUES_DES_CLIENTS)[number];
export type VueDesClients = VueNommee | 'tous';

export const PAR_PAGE_DES_CLIENTS = [10, 20, 50] as const;
export type ParPage = (typeof PAR_PAGE_DES_CLIENTS)[number];
export const PAR_PAGE_PAR_DEFAUT: ParPage = 20;

/** Les colonnes triables du tableau, et leur tri croissant dans l'API. */
export const TRIS_DES_COLONNES = {
  client: 'last_name',
  prochaine: 'next_action_at',
} as const;
export type ColonneTriable = keyof typeof TRIS_DES_COLONNES;

const TRIS_ACCEPTES = new Set<string>([
  ...Object.values(TRIS_DES_COLONNES).flatMap((s) => [s, `-${s}`]),
  '-follow_up_days',
]);

type Brut = Record<string, string | string[] | undefined>;

function une(valeur: string | string[] | undefined): string | undefined {
  const v = Array.isArray(valeur) ? valeur[0] : valeur;
  return v === undefined || v === '' ? undefined : v;
}

export interface LecteurDeLaListe {
  /** Le personnel de l'agence : les vues, les gestes, le tri par prochaine action. */
  readonly personnel: boolean;
  /** L'admin de l'agence : « Sans référent ». */
  readonly admin: boolean;
}

/**
 * Les vues proposées à ce lecteur, « Tous » compris, dans l'ordre de la maquette : quatre, toujours.
 * L'admin a « Sans référent » À LA PLACE de « Négociation » (maquette a-0, bureau) — l'étape reste au
 * filtre « Étape » ; l'agent a « Négociation » (maquette a-0, téléphone).
 */
export function vuesDuLecteur(lecteur: LecteurDeLaListe): readonly VueDesClients[] {
  if (!lecteur.personnel) return [];
  return lecteur.admin
    ? ['a-relancer', 'mes-clients', 'sans-referent', 'tous']
    : ['a-relancer', 'mes-clients', 'negociation', 'tous'];
}

export function vueDeLUrl(brut: Brut, lecteur: LecteurDeLaListe): VueDesClients {
  const v = une(brut.vue);
  const vues = vuesDuLecteur(lecteur);
  return v && (vues as readonly string[]).includes(v) ? (v as VueDesClients) : 'tous';
}

export interface FiltresDesClients {
  readonly status?: string;
  readonly pipeline_stage?: string;
  readonly search?: string;
  readonly tags?: string;
  readonly follow_up?: '1';
  readonly referent?: 'me' | 'none';
}

/** Le filtre qu'une vue ajoute ; « Négociation » l'emporte sur l'étape de l'URL. */
export function filtresDeLaVue(vue: VueDesClients): Partial<FiltresDesClients> {
  switch (vue) {
    case 'a-relancer':
      return { follow_up: '1' };
    case 'mes-clients':
      return { referent: 'me' };
    case 'negociation':
      return { pipeline_stage: 'negotiating' };
    case 'sans-referent':
      return { referent: 'none' };
    default:
      return {};
  }
}

/** Le tri par défaut : la relance la plus ancienne en tête d'« À relancer », la prochaine action ailleurs. */
export function triParDefaut(vue: VueDesClients, lecteur: LecteurDeLaListe, recherche: boolean): string | undefined {
  // TCK-702 — une recherche se classe par pertinence côté API : aucun tri explicite.
  if (recherche) return undefined;
  if (vue === 'a-relancer') return '-follow_up_days';
  // Hors personnel, la prochaine action est nulle sur chaque ligne : la plus récente d'abord, comme avant.
  return lecteur.personnel ? TRIS_DES_COLONNES.prochaine : '-created_at';
}

export function parPageDeLUrl(brut: Brut): ParPage {
  const n = Number(une(brut.per_page));
  return (PAR_PAGE_DES_CLIENTS as readonly number[]).includes(n) ? (n as ParPage) : PAR_PAGE_PAR_DEFAUT;
}

export interface EtatDeLaListe {
  readonly page: number;
  readonly parPage: ParPage;
  readonly vue: VueDesClients;
  /** Le tri demandé par l'URL (colonne), sinon celui de la vue. */
  readonly tri: string | undefined;
  readonly filtres: FiltresDesClients;
}

export function lireLaListe(brut: Brut, lecteur: LecteurDeLaListe): EtatDeLaListe {
  const p = une(brut.page);
  const page = p && /^[1-9]\d*$/.test(p) ? Number(p) : 1;
  const vue = vueDeLUrl(brut, lecteur);
  const search = une(brut.search);
  const s = une(brut.sort);
  const tri = s && TRIS_ACCEPTES.has(s) && (lecteur.personnel || !s.includes('next_action_at')) ? s : triParDefaut(vue, lecteur, Boolean(search));
  return {
    page,
    parPage: parPageDeLUrl(brut),
    vue,
    tri,
    filtres: {
      status: une(brut.status),
      pipeline_stage: une(brut.pipeline_stage),
      search,
      tags: une(brut.tags),
      ...filtresDeLaVue(vue),
    },
  };
}

/** Le sens du tri d'une colonne dans l'état courant : `asc`, `desc`, ou `null` (non triée). */
export function sensDeLaColonne(tri: string | undefined, colonne: ColonneTriable): 'asc' | 'desc' | null {
  const base = TRIS_DES_COLONNES[colonne];
  if (tri === base) return 'asc';
  if (tri === `-${base}`) return 'desc';
  return null;
}

/** Le tri qu'un clic sur l'en-tête pose : croissant d'abord, puis l'inverse. */
export function triAuClic(tri: string | undefined, colonne: ColonneTriable): string {
  const base = TRIS_DES_COLONNES[colonne];
  return tri === base ? `-${base}` : base;
}
