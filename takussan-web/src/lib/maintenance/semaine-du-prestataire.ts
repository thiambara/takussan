import { CHAMPS_D_UNE_CARTE, type InterventionEnFile } from '@/lib/maintenance/files';
import { lundiDe } from '@/lib/agenda/agenda';
import { decalerJour } from '@/lib/jour-de-l-api';
import { heureMuraleADakar } from '@/lib/visites/heure-de-dakar';
import type { ServiceProviderBill, ServiceProviderBillStatus } from '@/types/invoice';
import type { MaintenanceStatus } from '@/types/maintenance';

/**
 * TCK-2654, lot 4 — « Mes interventions » du prestataire : ce qu'il doit accepter, sa semaine et ses
 * factures. Les règles vivent ici, sans rendu : les tests les jugent sans fournisseur.
 *
 * Les jours sont des chaînes `AAAA-MM-JJ` À DAKAR (le fuseau des créneaux, `filter[scheduled_from|to]`
 * de l'API, TCK-2623), jamais les composantes locales du navigateur.
 */

/** Les colonnes d'une intervention du prestataire : celles d'une carte de file, plus l'acceptation. */
export const CHAMPS_DES_INTERVENTIONS_DU_PRESTATAIRE = [...CHAMPS_D_UNE_CARTE, 'accepted_at'] as const;

/** Le jour à Dakar d'un instant ISO. */
export function jourADakar(iso: string): string {
  return heureMuraleADakar(new Date(iso)).slice(0, 10);
}

/** L'heure murale à Dakar d'un instant ISO, en heures décimales (9 h 30 → 9,5). */
export function heureADakar(iso: string): number {
  const [h, m] = heureMuraleADakar(new Date(iso)).slice(11, 16).split(':').map(Number);
  return h + m / 60;
}

export interface SemaineDuPrestataire {
  /** Aujourd'hui à Dakar. */
  readonly aujourdhui: string;
  /** Les sept jours, du lundi au dimanche : les bornes de `filter[scheduled_from|to]` (incluses). */
  readonly jours: readonly string[];
}

/** La semaine (lundi → dimanche, à Dakar) qui contient `maintenant`. */
export function semaineDe(maintenant: Date): SemaineDuPrestataire {
  const aujourdhui = heureMuraleADakar(maintenant).slice(0, 10);
  const lundi = lundiDe(aujourdhui);
  return { aujourdhui, jours: Array.from({ length: 7 }, (_, i) => decalerJour(lundi, i)) };
}

/** Les statuts où le travail est rendu : le créneau se lit « fait » dans la semaine. */
const RENDUS: readonly MaintenanceStatus[] = ['completed', 'closed'];

/**
 * Ce qu'est un créneau de la semaine : `attente` tant que le prestataire ne l'a pas accepté (la file
 * `a_accepter` de l'API), `fait` une fois le travail rendu, `prevu` sinon.
 */
export type GenreDuCreneau = 'attente' | 'prevu' | 'fait';

export function genreDuCreneau(i: Pick<InterventionEnFile, 'status' | 'accepted_at' | 'file'>): GenreDuCreneau {
  if (RENDUS.includes(i.status)) return 'fait';
  if (i.file === 'a_accepter' || !i.accepted_at) return 'attente';
  return 'prevu';
}

export interface CreneauDeLaGrille {
  readonly intervention: InterventionEnFile;
  readonly jour: string;
  /** Début, en heures décimales à Dakar. */
  readonly de: number;
  readonly genre: GenreDuCreneau;
}

export interface GrilleDeLaSemaine {
  /** Lundi → samedi, et le dimanche seulement quand un créneau y tombe. */
  readonly jours: readonly string[];
  /** Les heures pleines affichées : 8 h → 17 h, élargies pour qu'aucun créneau n'en sorte. */
  readonly heures: readonly number[];
  readonly creneaux: readonly CreneauDeLaGrille[];
}

/** La plage par défaut de la grille (la maquette) : 8 h → 17 h. */
const PREMIERE_HEURE = 8;
const DERNIERE_HEURE = 17;

/**
 * La grille de la semaine. Un créneau n'a pas d'heure de fin servie (`scheduled_at` seul) : la grille
 * le pose sur son heure de début, pour une heure. Les interventions sans créneau ou hors de la semaine
 * n'y entrent pas.
 */
export function grilleDeLaSemaine(interventions: readonly InterventionEnFile[], semaine: SemaineDuPrestataire): GrilleDeLaSemaine {
  const creneaux = interventions
    .filter((i): i is InterventionEnFile & { scheduled_at: string } => i.scheduled_at !== null)
    .map((i) => ({ intervention: i, jour: jourADakar(i.scheduled_at), de: heureADakar(i.scheduled_at), genre: genreDuCreneau(i) }))
    .filter((c) => semaine.jours.includes(c.jour))
    .sort((a, b) => a.jour.localeCompare(b.jour) || a.de - b.de);
  const dimanche = semaine.jours[6];
  const jours = creneaux.some((c) => c.jour === dimanche) ? semaine.jours : semaine.jours.slice(0, 6);
  const premiere = Math.min(PREMIERE_HEURE, ...creneaux.map((c) => Math.floor(c.de)));
  const derniere = Math.max(DERNIERE_HEURE, ...creneaux.map((c) => Math.floor(c.de)));
  return { jours, heures: Array.from({ length: derniere - premiere + 1 }, (_, k) => premiere + k), creneaux };
}

export interface JourDeTournee {
  readonly jour: string;
  readonly interventions: readonly InterventionEnFile[];
}

export interface Tournee {
  /** Les jours, d'aujourd'hui à la fin de la semaine, qui portent un passage ACCEPTÉ à venir. */
  readonly jours: readonly JourDeTournee[];
  /** Les jours ouvrés restants (jusqu'au samedi) après le dernier jour de passage : « rien de prévu ». */
  readonly sansRien: readonly string[];
}

/**
 * « Cette semaine » : les passages acceptés et non rendus d'aujourd'hui à la fin de la semaine, par
 * jour et par heure — celui de ce matin compris, tant qu'il n'est pas rendu. Ce qui reste à accepter
 * n'y est pas (sa carte est au-dessus), ni ce qui est rendu.
 */
export function tourneeDeLaSemaine(interventions: readonly InterventionEnFile[], semaine: SemaineDuPrestataire): Tournee {
  const restants = semaine.jours.filter((j) => j >= semaine.aujourdhui);
  const parJour = new Map<string, InterventionEnFile[]>();
  for (const i of interventions) {
    if (i.scheduled_at === null || genreDuCreneau(i) !== 'prevu') continue;
    const jour = jourADakar(i.scheduled_at);
    if (!restants.includes(jour)) continue;
    parJour.set(jour, [...(parJour.get(jour) ?? []), i]);
  }
  const jours = [...parJour.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([jour, liste]) => ({ jour, interventions: [...liste].sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? '')) }));
  const dernier = jours.at(-1)?.jour ?? null;
  const samedi = semaine.jours[5];
  const sansRien = restants.filter((j) => j <= samedi && (dernier === null || j > dernier));
  return { jours, sansRien };
}

/** Ce qui reste à percevoir : la facture attend la validation de l'agence, ou elle est validée et pas encore payée. */
export const STATUTS_A_PERCEVOIR: readonly ServiceProviderBillStatus[] = ['pending_validation', 'validated'];

/** `PER_PAGE_MAX` de l'API : au-delà, la somme lue ne serait pas le total. */
export const FACTURES_LUES_POUR_LE_TOTAL = 100;

/**
 * « À percevoir » : la somme des factures `STATUTS_A_PERCEVOIR` que l'API a rendues — filtrées par
 * elle, jamais sur une page déjà lue. `null` quand l'API en compte plus que la page n'en porte : un
 * total partiel ne s'affiche pas.
 */
export function aPercevoir(factures: readonly Pick<ServiceProviderBill, 'amount' | 'status'>[], totalServi: number): number | null {
  if (totalServi > factures.length) return null;
  return factures.filter((f) => STATUTS_A_PERCEVOIR.includes(f.status)).reduce((s, f) => s + Number(f.amount), 0);
}
