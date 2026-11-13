/**
 * TCK-2653 — les files d'attente des interventions côté agence (TCK-2652 côté API,
 * `MaintenanceQueue`), lues sans rendu : l'ordre des files, l'attente écrite sur chaque carte et le
 * geste principal de chaque file. Les composants de `components/maintenance/files/` ne font que
 * rendre ce que ces fonctions décident ; les tests les jugent ici, sans fournisseur.
 */
import type { MaintenanceRequest, MaintenanceStatus } from '@/types/maintenance';

/** Les files de l'API (`file` de la ressource, `filter[file]`, clés de `/summary`). */
export type FileDIntervention =
  | 'a_dispatcher'
  | 'en_retard'
  | 'chez_le_bailleur'
  | 'en_cours'
  | 'a_confirmer'
  | 'terminees'
  | 'a_accepter';

/** Qui doit agir (`waiting_on`). */
export type AttenduDe = 'agency' | 'provider' | 'owner' | 'tenant' | 'none';

/**
 * Les cinq files de l'agence, dans l'ordre de la maquette : ce qui attend l'agence d'abord.
 * « Terminées » n'en est pas une colonne : c'est une vue à part (AC1 — aucune carte terminée avant
 * elle), et `a_accepter` est la file du prestataire (TCK-2654).
 */
export const FILES_DE_L_AGENCE = ['a_dispatcher', 'en_retard', 'chez_le_bailleur', 'en_cours', 'a_confirmer'] as const;
export type FileDeLAgence = (typeof FILES_DE_L_AGENCE)[number];

/** `GET /api/maintenance-requests/summary` : un compte par file. */
export type ResumeDesFiles = Readonly<Record<FileDIntervention, number>>;

/** Les champs de file qu'une ligne porte (TCK-2652), `null` quand `status`, `assigned_to` ou `scheduled_at` n'ont pas été lus. */
export interface ChampsDeFile {
  readonly file?: FileDIntervention | null;
  readonly waiting_on?: AttenduDe | null;
  readonly waiting_since?: string | null;
  readonly slot_overdue_days?: number | null;
  readonly auto_close_at?: string | null;
}

export type InterventionEnFile = MaintenanceRequest & ChampsDeFile;

/**
 * Les colonnes que la carte d'une file lit. `status`, `assigned_to` et `scheduled_at` sont
 * OBLIGATOIRES : sans l'un d'eux, l'API rend `file` et l'attente à `null` (une file déduite d'une
 * colonne absente serait fausse). `queue_entered_at` et `completed_at` nourrissent `waiting_since`
 * et `auto_close_at`.
 */
export const CHAMPS_D_UNE_CARTE = [
  'id',
  'property_id',
  'requester_id',
  'assigned_to',
  'title',
  'category',
  'priority',
  'status',
  'scheduled_at',
  'completed_at',
  'queue_entered_at',
  'quote_amount',
  'quote_currency',
  'created_at',
] as const;

/** Le bien de la carte : son titre ; son quartier (`location`) vient de l'adresse, chargée par l'API. */
export const CHAMPS_DU_BIEN_D_UNE_CARTE = ['id', 'title', 'slug', 'agency_id'] as const;

/** Le demandeur et le prestataire de la carte : leur nom. */
export const CHAMPS_DES_PERSONNES_D_UNE_CARTE = ['id', 'first_name', 'last_name', 'username'] as const;

/** Au-delà de trois jours, une attente qui revient à l'agence ou au bailleur s'écrit en ambre. */
export const SEUIL_AMBRE_JOURS = 3;

const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;

export interface Duree {
  readonly n: number;
  readonly unite: 'minute' | 'hour' | 'day';
}

/** Le temps écoulé depuis `depuis`, arrondi à l'unité qui se lit : minutes, heures, puis jours. */
export function dureeDepuis(depuis: string | null | undefined, maintenant: Date): Duree | null {
  if (!depuis) return null;
  const debut = new Date(depuis).getTime();
  if (Number.isNaN(debut)) return null;
  const ecart = Math.max(0, maintenant.getTime() - debut);
  if (ecart < HEURE) return { n: Math.max(1, Math.floor(ecart / MINUTE)), unite: 'minute' };
  if (ecart < JOUR) return { n: Math.floor(ecart / HEURE), unite: 'hour' };
  return { n: Math.floor(ecart / JOUR), unite: 'day' };
}

/** Les jours entiers jusqu'à `jusqua` (0 si c'est passé), arrondis au jour supérieur. */
export function joursAvant(jusqua: string | null | undefined, maintenant: Date): number | null {
  if (!jusqua) return null;
  const fin = new Date(jusqua).getTime();
  if (Number.isNaN(fin)) return null;
  return Math.max(0, Math.ceil((fin - maintenant.getTime()) / JOUR));
}

export type TonDeLAttente = 'rouge' | 'ambre' | 'neutre';

/**
 * Ce que la carte écrit sous son titre : depuis quand elle attend, et si c'est anormal.
 * `cle` est une clé de `maintenance.files.attente`, `valeurs` ses paramètres bruts (la vue les
 * formate : une durée, une date, un nombre).
 */
export type Attente =
  | { readonly cle: 'ouverte'; readonly duree: Duree; readonly ton: TonDeLAttente }
  | { readonly cle: 'creneauDepasse'; readonly creneau: string; readonly jours: number; readonly ton: 'rouge' }
  | { readonly cle: 'chezLeBailleur'; readonly duree: Duree; readonly ton: TonDeLAttente }
  | { readonly cle: 'devisADecider'; readonly duree: Duree; readonly ton: TonDeLAttente }
  | { readonly cle: 'devisDemande'; readonly duree: Duree; readonly ton: 'neutre' }
  | { readonly cle: 'creneau'; readonly creneau: string; readonly ton: 'neutre' }
  | { readonly cle: 'confiee'; readonly duree: Duree; readonly ton: 'neutre' }
  | { readonly cle: 'aConfirmer'; readonly terminee: string | null; readonly jours: number | null; readonly ton: 'neutre' };

function tonDUneAttente(duree: Duree): TonDeLAttente {
  return duree.unite === 'day' && duree.n > SEUIL_AMBRE_JOURS ? 'ambre' : 'neutre';
}

/**
 * L'attente d'une demande, selon sa file. `null` quand la ligne ne porte pas sa file (champs
 * manquants) ou qu'elle est terminée : la carte n'écrit alors rien plutôt qu'une durée fausse.
 */
export function attenteDe(i: InterventionEnFile, maintenant: Date): Attente | null {
  const duree = dureeDepuis(i.waiting_since ?? i.created_at, maintenant);
  switch (i.file) {
    case 'a_dispatcher':
      return duree ? { cle: 'ouverte', duree, ton: tonDUneAttente(duree) } : null;
    case 'en_retard':
      return i.scheduled_at ? { cle: 'creneauDepasse', creneau: i.scheduled_at, jours: i.slot_overdue_days ?? 0, ton: 'rouge' } : null;
    case 'chez_le_bailleur':
      return duree ? { cle: 'chezLeBailleur', duree, ton: tonDUneAttente(duree) } : null;
    case 'en_cours':
      if (i.status === 'quote_submitted') return duree ? { cle: 'devisADecider', duree, ton: tonDUneAttente(duree) } : null;
      if (i.status === 'quote_requested') return duree ? { cle: 'devisDemande', duree, ton: 'neutre' } : null;
      if (i.scheduled_at) return { cle: 'creneau', creneau: i.scheduled_at, ton: 'neutre' };
      return duree ? { cle: 'confiee', duree, ton: 'neutre' } : null;
    case 'a_confirmer':
      return { cle: 'aConfirmer', terminee: i.completed_at ?? null, jours: joursAvant(i.auto_close_at, maintenant), ton: 'neutre' };
    default:
      return null;
  }
}

/**
 * Le geste de la carte, selon sa file (maquette « Agence — files ») : « Choisir un prestataire »
 * à dispatcher, « Relancer » et « Réassigner » en retard, « Voir le devis » chez le bailleur ou
 * quand un devis attend l'agence. Les files sans geste (en cours, à confirmer) se lisent en ligne
 * compacte. « Relancer le bailleur » attend que l'API serve le contact du bailleur (cf. ticket).
 */
export type GesteDeCarte = 'choisir' | 'relancer' | 'reassigner' | 'voirDevis';

export function gestesDeLaCarte(i: Pick<InterventionEnFile, 'file' | 'status'>): readonly GesteDeCarte[] {
  switch (i.file) {
    case 'a_dispatcher':
      return ['choisir'];
    case 'en_retard':
      return ['relancer', 'reassigner'];
    case 'chez_le_bailleur':
      return ['voirDevis'];
    case 'en_cours':
      return i.status === 'quote_submitted' ? ['voirDevis'] : [];
    default:
      return [];
  }
}

/** Les statuts qui ne paraissent que dans « À confirmer » et « Terminées » (P1 de l'audit). */
export const STATUTS_TERMINES: readonly MaintenanceStatus[] = ['completed', 'closed', 'cancelled'];

/** La somme des cinq files : « N en attente d'un geste ». */
export function enAttenteDUnGeste(resume: ResumeDesFiles): number {
  return FILES_DE_L_AGENCE.reduce((s, f) => s + (resume[f] ?? 0), 0);
}
