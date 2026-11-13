import type { MaintenanceCategory, MaintenancePriority, MaintenanceStatus } from '@/types/maintenance';
import type { Persona } from '@/lib/navigation/personas';

/**
 * TCK-2654 — le signalement du LOCATAIRE, photo d'abord : ce qui se décide sans écran.
 *
 * Le formulaire du personnel (`MaintenanceForm`) garde ses neuf catégories, ses quatre priorités, son
 * titre et sa description : ce module ne sert que la forme courte du locataire.
 */

/** Les six tuiles « C'est quoi ? », projetées sur l'énumération de l'API (contrainte du ticket). */
export const TUILES_DU_LOCATAIRE = [
  'plumbing',
  'electrical',
  'locksmith',
  'pest_control',
  'appliance',
  'other',
] as const satisfies readonly MaintenanceCategory[];

export type TuileDuLocataire = (typeof TUILES_DU_LOCATAIRE)[number];

export function estTuileDuLocataire(categorie: string | null | undefined): categorie is TuileDuLocataire {
  return (TUILES_DU_LOCATAIRE as readonly string[]).includes(categorie ?? '');
}

/**
 * « C'est urgent ? » : deux réponses seulement. « Oui, ça ne peut pas attendre » → `urgent`, « quelques
 * jours » → `normal`. Les quatre priorités restent au personnel (« Changer la priorité »).
 */
export type Urgence = 'urgent' | 'attendre';

export function prioriteDeLUrgence(urgence: Urgence | null): MaintenancePriority {
  return urgence === 'urgent' ? 'urgent' : 'normal';
}

/**
 * Le formulaire de `/app/maintenance/new` se choisit par le persona de la coque : le locataire n'est
 * jamais donneur d'ordre d'un bien (`MaintenanceRequestPolicy::isPrincipalFor` : bailleur du bien ou
 * personnel de son agence, deux profils que le persona `locataire` exclut — `resoudrePersona`), donc
 * l'API ne lui exige pas de description. Tout autre persona garde le formulaire du personnel : un
 * agent ou un bailleur qui loue aussi un logement y remplit titre et description, sans 422.
 */
export function formulaireDuSignalement(persona: Persona): 'locataire' | 'personnel' {
  return persona === 'locataire' ? 'locataire' : 'personnel';
}

export interface CorpsDuSignalement {
  readonly property_id: number;
  readonly lease_id: number | null;
  readonly title: string;
  readonly category: TuileDuLocataire;
  readonly priority: MaintenancePriority;
  /** Absente quand rien n'est écrit : l'API la rend facultative au demandeur qui n'est pas donneur d'ordre. */
  readonly description?: string;
}

/**
 * Le corps du `POST /api/maintenance-requests`. Le titre se déduit de la catégorie (« Problème d'eau »)
 * dans la langue de l'écran ; « En deux mots » devient la description, et n'est pas envoyée vide.
 */
export function corpsDuSignalement({
  propertyId,
  leaseId,
  categorie,
  urgence,
  texte,
  titre,
}: {
  readonly propertyId: number;
  readonly leaseId: number | null;
  readonly categorie: TuileDuLocataire;
  readonly urgence: Urgence | null;
  readonly texte: string;
  readonly titre: string;
}): CorpsDuSignalement {
  const description = texte.trim();
  return {
    property_id: propertyId,
    lease_id: leaseId,
    title: titre,
    category: categorie,
    priority: prioriteDeLUrgence(urgence),
    ...(description === '' ? {} : { description }),
  };
}

/**
 * Les photos s'AJOUTENT (un cliché, puis un autre, puis la galerie), et le total reste sous la borne
 * de l'API (`PHOTOS_PAR_SELECTION_MAX`). Ce qui la dépasserait n'est pas pris : `refusees` le compte.
 */
export function ajouterPhotos<T>(
  actuelles: readonly T[],
  nouvelles: readonly T[],
  max: number,
): { readonly photos: readonly T[]; readonly refusees: number } {
  const place = Math.max(0, max - actuelles.length);
  return {
    photos: [...actuelles, ...nouvelles.slice(0, place)],
    refusees: Math.max(0, nouvelles.length - place),
  };
}

/**
 * Les quatre étapes du locataire (« Reçue », « Artisan choisi », « Visite », « Vous confirmez ») : le
 * nombre d'étapes FAITES. L'étape suivante est l'étape en cours.
 */
export function etapesFaites(statut: MaintenanceStatus | null | undefined): number {
  switch (statut) {
    // Un devis approuvé désigne l'artisan ; une demande de devis le cherche encore.
    case 'approved':
    case 'assigned':
    case 'in_progress':
      return 2;
    case 'completed':
      return 3;
    case 'closed':
      return 4;
    default:
      return 1;
  }
}
