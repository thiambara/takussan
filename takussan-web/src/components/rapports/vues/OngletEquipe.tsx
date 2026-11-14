import { TeamPerformanceTable } from '@/components/admin/team/TeamPerformanceTable';

/**
 * TCK-2628 (décision 2) — l'onglet « Équipe » : la performance de l'équipe, le composant de la vue
 * « Performance » de `ConsoleDeLEquipe`, monté tel quel. Sa garde est celle de sa page d'origine
 * (`/app/agency/team`, agence `standard`) et sa condition, `reports.view_agency` (`garderLOnglet`) :
 * l'agence est donc connue ici.
 */
export function OngletEquipe({ agencyId }: { readonly agencyId: number }) {
  return <TeamPerformanceTable agencyId={agencyId} />;
}
