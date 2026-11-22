import { EquipeDuRapport } from '@/components/rapports/equipe/EquipeDuRapport';

/**
 * TCK-2628 (décision 2) — l'onglet « Équipe ». Sa garde est celle de sa page d'origine (`/app/agency/team`,
 * agence `standard`) et sa condition, `reports.view_agency` (`garderLOnglet`) : l'agence est donc connue ici.
 *
 * TCK-2629 — le tableau des agents de la maquette (demandes traitées et délai de réponse compris), sur la
 * même lecture que « Équipe ce mois » de la vue d'ensemble (`team-performance`). La console d'équipe garde
 * son propre tableau (`TeamPerformanceTable`).
 */
export function OngletEquipe({ agencyId }: { readonly agencyId: number }) {
  return <EquipeDuRapport agencyId={agencyId} />;
}
