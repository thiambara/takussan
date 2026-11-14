import { ExportsDuRapport } from '@/components/rapports/exports/ExportsDuRapport';
import { isAdmin, isAgent } from '@/lib/roles';
import type { User } from '@/types/user';

/**
 * TCK-2628 — l'onglet « Exports » : le centre de téléchargement (TCK-032 P2), sorti de
 * `overview/exports/page.tsx`. TCK-587 — le personnel voit les exports dont il tient la capacité ; le
 * bailleur, ceux de ses propres données (paiements, baux, biens).
 *
 * TCK-2629 — cartes prêtes, export personnalisé et « Derniers exports » (`ExportsDuRapport`), tous sous
 * la même liste de types permis.
 */
export function OngletExports({ user }: { readonly user: User }) {
  return <ExportsDuRapport staff={isAdmin(user.roles) || isAgent(user.roles)} />;
}
