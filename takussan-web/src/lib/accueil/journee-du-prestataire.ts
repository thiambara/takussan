import type { InterventionEnFile } from '@/lib/maintenance/files';
import { genreDuCreneau, jourADakar, type SemaineDuPrestataire } from '@/lib/maintenance/semaine-du-prestataire';
import type { MaintenanceAbilities, MaintenanceStatus } from '@/types/maintenance';

/**
 * TCK-2625 — l'accueil du prestataire : sa liste de travail (spec § 2.5 : ni tableau de bord ni
 * « Rapports »). Les règles vivent ici, sans rendu.
 *
 * La source est la semaine de « Mes interventions » (TCK-2654, `useSemaineDuPrestataire`) : la même
 * requête, le même cache. Aujourd'hui et « À venir » s'en déduisent ; rien n'est relu.
 */

export interface JourneeDuPrestataire {
  /** Les créneaux d'aujourd'hui (à Dakar) qui ne sont pas rendus, par heure. */
  readonly aujourdhui: readonly InterventionEnFile[];
  /** Les créneaux d'après aujourd'hui jusqu'à la fin de la semaine, non rendus, par date. */
  readonly aVenir: readonly InterventionEnFile[];
}

const parCreneau = (a: InterventionEnFile, b: InterventionEnFile) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? '');

export function journeeDuPrestataire(interventions: readonly InterventionEnFile[], semaine: SemaineDuPrestataire): JourneeDuPrestataire {
  const vivants = interventions.filter((i): i is InterventionEnFile & { scheduled_at: string } => i.scheduled_at !== null && genreDuCreneau(i) !== 'fait');
  return {
    aujourdhui: vivants.filter((i) => jourADakar(i.scheduled_at) === semaine.aujourdhui).sort(parCreneau),
    aVenir: vivants
      .filter((i) => {
        const jour = jourADakar(i.scheduled_at);
        return jour > semaine.aujourdhui && semaine.jours.includes(jour);
      })
      .sort(parCreneau),
  };
}

/** Le créneau est-il accepté ? Seul un créneau accepté lit sa fiche (adresse, téléphone, gestes). */
export function estAccepte(i: Pick<InterventionEnFile, 'status' | 'accepted_at' | 'file'>): boolean {
  return genreDuCreneau(i) === 'prevu';
}

/**
 * Le geste d'une carte d'aujourd'hui, décidé par la FICHE (les drapeaux que l'API calcule pour
 * l'appelant), jamais par une table recopiée ici :
 *
 *  - `repondre` : le créneau n'est pas accepté. « Commencer » n'y est pas proposé — démarrer vaut
 *    acceptation côté API (`MaintenanceQuoteWorkflow::start`), ce serait accepter sans le dire ;
 *  - `commencer` : accepté, et la fiche permet `in_progress` (`abilities.transitions`) ;
 *  - `terminer` : en cours, et la fiche permet le rapport de fin (`can_complete`) ;
 *  - `null` : aucun geste permis, ou la fiche n'est pas encore lue.
 */
export type GesteDuCreneau = 'repondre' | 'commencer' | 'terminer';

export function gesteDuCreneau(
  i: Pick<InterventionEnFile, 'status' | 'accepted_at' | 'file'>,
  abilities: Pick<MaintenanceAbilities, 'transitions' | 'can_complete'> | undefined,
): GesteDuCreneau | null {
  if (!estAccepte(i)) return 'repondre';
  if (!abilities) return null;
  const statut: MaintenanceStatus = i.status;
  if (statut === 'in_progress') return abilities.can_complete ? 'terminer' : null;
  return abilities.transitions.includes('in_progress') ? 'commencer' : null;
}
