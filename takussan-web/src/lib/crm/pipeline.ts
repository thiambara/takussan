/**
 * TCK-2592 — l'état du pipeline, lu dans l'URL et traduit en lecture de l'API.
 *
 * Pur, sans directive : la page (composant serveur) fournit le lecteur, le composant client lit
 * `useSearchParams` et écrit par `useVueDansLUrl`.
 *
 *  · `portee` : `moi` · `agence` · l'identifiant d'un agent. L'agent ouvre sur « Moi », l'admin sur
 *    « Agence » (maquette `app-pipeline` a). « Agence » et un agent isolé demandent la lecture de
 *    l'agence (`crm.view_all`, `CustomerPolicy::viewAgencyPipeline`) : sans elle, `scope=agency`
 *    rendrait 403, la portée retombe donc sur « Moi ». Le bailleur n'a pas de portée : sa lecture est
 *    celle de la fiche (`Customer::visibleTo`), sans relance (TCK-2588 : `follow_up=1` ne lui rend rien).
 *  · `vue` : `liste` (défaut du personnel) · `etapes` (défaut du bailleur, qui n'a rien à relancer).
 *  · `segment` : `a-relancer` · `a-jour` · `tous` (défaut, absent de l'URL) — la liste du bureau.
 *  · `etape` : une étape VIVANTE choisie au portefeuille du téléphone.
 *  · `search`, `tags`, `relance=1` (« À relancer seulement ») : la barre de filtres.
 *  · `sorties=1` : les étapes terminales ouvertes (« Déplier » du bureau, l'en-tête du portefeuille) ;
 *    `sorties=30` : les mêmes, bornées aux sorties des 30 derniers jours — la tuile « Conversion »
 *    (TCK-2592, décision 1b, AC4) ouvre les fiches qu'elle compte (`filter[exited_within_days]`).
 *
 * ⚠ Les colonnes et les statistiques reçoivent les MÊMES filtres : le compte d'une colonne vient des
 * statistiques (TCK-591), et « Charger plus (x/total) » mentirait sinon. La seule différence est la
 * portée : `scope=mine` refuse `filter[referent]` (`PipelineStatsRequest`), qu'il pose lui-même.
 */
import type { CustomerPipelineStage } from '@/types/customer';
import type { PipelineStats } from '@/types/pipeline';

export const ETAPES_VIVANTES = ['lead', 'prospect', 'qualified', 'negotiating'] as const satisfies readonly CustomerPipelineStage[];
export type EtapeVivante = (typeof ETAPES_VIVANTES)[number];
export const ETAPES_TERMINALES = ['converted', 'lost'] as const satisfies readonly CustomerPipelineStage[];

/** La période de la tuile « Conversion » : celle de `exits_last_30d` (`PipelineStatsService::exitsLast30Days`). */
export const JOURS_DES_SORTIES = 30;

/** Ce que la clé de cache d'une colonne bornée ajoute à celle de la colonne entière ({@link cleDUneColonne}). */
export const SUFFIXE_DES_SORTIES_DE_LA_PERIODE = `&exited_within_days=${JOURS_DES_SORTIES}`;

export const VUES_DU_PIPELINE = ['liste', 'etapes'] as const;
export type VueDuPipeline = (typeof VUES_DU_PIPELINE)[number];

export const SEGMENTS_DU_PIPELINE = ['a-relancer', 'a-jour', 'tous'] as const;
export type SegmentDuPipeline = (typeof SEGMENTS_DU_PIPELINE)[number];

export type PorteeDuPipeline = { readonly type: 'moi' } | { readonly type: 'agence' } | { readonly type: 'agent'; readonly id: number };

export interface LecteurDuPipeline {
  /** Le personnel de l'agence (agent ou admin) : la portée, les relances, les gestes enregistrés. */
  readonly personnel: boolean;
  /** L'admin : ouvre sur « Agence ». */
  readonly admin: boolean;
  /** La lecture de l'agence entière (`crm.view_all`) : « Agence » et l'isolement d'un agent. */
  readonly agence: boolean;
}

export interface EtatDuPipeline {
  readonly portee: PorteeDuPipeline | null;
  readonly vue: VueDuPipeline;
  readonly segment: SegmentDuPipeline;
  readonly etape: EtapeVivante | null;
  readonly search: string | null;
  readonly tags: string | null;
  readonly relance: boolean;
  /** `sorties=1` ou `30` : Gagné et Perdu dépliés (bureau), ou montrés à la place des étapes vivantes (téléphone). */
  readonly sorties: boolean;
  /** `sorties=30` : ces deux étapes bornées aux sorties de la période (la tuile « Conversion »). */
  readonly sortiesDeLaPeriode: boolean;
}

type Brut = Record<string, string | string[] | undefined | null>;

function une(valeur: string | string[] | undefined | null): string | undefined {
  const v = Array.isArray(valeur) ? valeur[0] : valeur;
  const t = typeof v === 'string' ? v.trim() : undefined;
  return t ? t : undefined;
}

function parmi<T extends string>(v: string | undefined, valeurs: readonly T[]): T | null {
  return v !== undefined && (valeurs as readonly string[]).includes(v) ? (v as T) : null;
}

export function porteeParDefaut(lecteur: LecteurDuPipeline): PorteeDuPipeline | null {
  if (!lecteur.personnel) return null;
  return lecteur.admin && lecteur.agence ? { type: 'agence' } : { type: 'moi' };
}

function porteeDeLUrl(v: string | undefined, lecteur: LecteurDuPipeline): PorteeDuPipeline | null {
  const defaut = porteeParDefaut(lecteur);
  if (defaut === null || v === undefined) return defaut;
  if (v === 'moi') return { type: 'moi' };
  if (!lecteur.agence) return { type: 'moi' };
  if (v === 'agence') return { type: 'agence' };
  if (/^[1-9]\d{0,17}$/.test(v)) return { type: 'agent', id: Number(v) };
  return defaut;
}

export function lirePipeline(brut: Brut, lecteur: LecteurDuPipeline): EtatDuPipeline {
  const personnel = lecteur.personnel;
  return {
    portee: porteeDeLUrl(une(brut.portee), lecteur),
    vue: parmi(une(brut.vue), VUES_DU_PIPELINE) ?? (personnel ? 'liste' : 'etapes'),
    segment: (personnel ? parmi(une(brut.segment), SEGMENTS_DU_PIPELINE) : null) ?? 'tous',
    etape: parmi(une(brut.etape), ETAPES_VIVANTES),
    search: une(brut.search) ?? null,
    tags: une(brut.tags) ?? null,
    relance: personnel && une(brut.relance) === '1',
    sorties: une(brut.sorties) === '1' || une(brut.sorties) === String(JOURS_DES_SORTIES),
    sortiesDeLaPeriode: une(brut.sorties) === String(JOURS_DES_SORTIES),
  };
}

/** La valeur de `?portee=` d'une portée (`null` : la valeur par défaut, absente de l'URL). */
export function porteeEnUrl(portee: PorteeDuPipeline, lecteur: LecteurDuPipeline): string | null {
  const defaut = porteeParDefaut(lecteur);
  const v = portee.type === 'agent' ? String(portee.id) : portee.type;
  const d = defaut === null ? null : defaut.type === 'agent' ? String(defaut.id) : defaut.type;
  return v === d ? null : v;
}

export interface FiltresDuPipeline {
  readonly status: 'active';
  readonly referent?: string;
  readonly search?: string;
  readonly tags?: string;
  readonly follow_up?: '1' | '0';
  /** La liste seule : l'étape choisie au portefeuille ou au filtre « Étape ». */
  readonly pipeline_stage?: EtapeVivante;
  /** Une colonne terminale sous `sorties=30` : les sorties de la période (décision 1b). */
  readonly exited_within_days?: string;
}

/** Les filtres de la barre, communs aux colonnes et aux statistiques (sans la portée). */
function filtresDeLaBarre(etat: EtatDuPipeline): FiltresDuPipeline {
  return {
    status: 'active',
    ...(etat.search ? { search: etat.search } : {}),
    ...(etat.tags ? { tags: etat.tags } : {}),
    ...(etat.relance ? { follow_up: '1' as const } : {}),
  };
}

function referentDe(portee: PorteeDuPipeline | null): string | undefined {
  if (portee === null || portee.type === 'agence') return undefined;
  return portee.type === 'moi' ? 'me' : String(portee.id);
}

/** Les filtres d'une colonne du kanban (l'étape s'y ajoute, colonne par colonne). */
export function filtresDesColonnes(etat: EtatDuPipeline): FiltresDuPipeline {
  const referent = referentDe(etat.portee);
  return { ...filtresDeLaBarre(etat), ...(referent ? { referent } : {}) };
}

/** Gagné et Perdu sous `sorties=30` : la colonne ne lit que les sorties de la période. */
export function borneeALaPeriode(etat: EtatDuPipeline, stage: CustomerPipelineStage): boolean {
  return etat.sortiesDeLaPeriode && (ETAPES_TERMINALES as readonly CustomerPipelineStage[]).includes(stage);
}

/** Les filtres d'UNE colonne : ceux des colonnes, plus la période sur Gagné et Perdu sous `sorties=30`. */
export function filtresDUneColonne(etat: EtatDuPipeline, stage: CustomerPipelineStage): FiltresDuPipeline {
  const base = filtresDesColonnes(etat);
  return borneeALaPeriode(etat, stage) ? { ...base, exited_within_days: String(JOURS_DES_SORTIES) } : base;
}

/** La clé de cache d'une colonne : une colonne bornée n'est pas la colonne entière. */
export function cleDUneColonne(etat: EtatDuPipeline, stage: CustomerPipelineStage): string {
  const cle = cleDesFiltres(etat);
  return borneeALaPeriode(etat, stage) ? `${cle}${SUFFIXE_DES_SORTIES_DE_LA_PERIODE}` : cle;
}

/**
 * Le compte d'une étape, lu dans les statistiques (TCK-591) : `stage_counts`. Une colonne bornée n'en a
 * aucun ici : `exits_last_30d` compte des sorties du journal, pas les fiches que la colonne lit (une
 * fiche archivée, ou ressortie deux fois, l'écarte) — elle se compte par sa propre pagination
 * (`useColonnesDuPipeline().totalLu`).
 */
export function totalDUneEtape(etat: EtatDuPipeline, stats: PipelineStats | undefined, stage: CustomerPipelineStage): number | undefined {
  if (borneeALaPeriode(etat, stage)) return undefined;
  return stats?.stage_counts?.[stage];
}

export interface ParametresDesStats {
  readonly scope?: 'mine' | 'agency';
  readonly filter: FiltresDuPipeline;
}

/** La lecture des statistiques : la portée en `scope`, les mêmes filtres que les colonnes. */
export function parametresDesStats(etat: EtatDuPipeline): ParametresDesStats {
  const barre = filtresDeLaBarre(etat);
  const p = etat.portee;
  if (p === null) return { filter: barre };
  if (p.type === 'moi') return { scope: 'mine', filter: barre };
  return { scope: 'agency', filter: p.type === 'agent' ? { ...barre, referent: String(p.id) } : barre };
}

/** Une clé stable des filtres d'une lecture : elle entre dans les clés de cache des colonnes et des listes. */
export function cleDesFiltres(etat: EtatDuPipeline): string {
  const f: Record<string, string | undefined> = { ...filtresDesColonnes(etat) };
  return Object.keys(f)
    .filter((k) => f[k] !== undefined)
    .sort()
    .map((k) => `${k}=${f[k]}`)
    .join('&');
}

/**
 * Les filtres d'une liste (relances du téléphone, vue Liste du bureau) : ceux des colonnes, l'étape
 * choisie, et le segment — `a-relancer` : `follow_up=1` ; `a-jour` : `follow_up=0` ; `tous` : rien
 * (sauf « À relancer seulement »).
 */
export function filtresDeLaListe(etat: EtatDuPipeline, segment: SegmentDuPipeline): FiltresDuPipeline {
  const base = filtresDesColonnes(etat);
  const suivi = segment === 'a-relancer' ? '1' : segment === 'a-jour' ? '0' : base.follow_up;
  const { follow_up: _ignore, ...reste } = base;
  void _ignore;
  return { ...reste, ...(suivi ? { follow_up: suivi } : {}), ...(etat.etape ? { pipeline_stage: etat.etape } : {}) };
}

/** La clé de cache d'une liste : ses filtres complets, segment compris. */
export function cleDeLaListe(etat: EtatDuPipeline, segment: SegmentDuPipeline): string {
  const f: Record<string, string | undefined> = { ...filtresDeLaListe(etat, segment) };
  return Object.keys(f)
    .filter((k) => f[k] !== undefined)
    .sort()
    .map((k) => `${k}=${f[k]}`)
    .join('&');
}
