import { ExportForm } from '@/components/rapports/exports/ExportForm';
import { isAdmin, isAgent } from '@/lib/roles';
import type { User } from '@/types/user';

/**
 * TCK-2628 — l'onglet « Exports » : le centre de téléchargement (TCK-032 P2), sorti de
 * `overview/exports/page.tsx`. TCK-587 — le personnel voit les exports dont il tient la capacité (lue par
 * `ExportForm`) ; le bailleur, ceux de ses propres données.
 */
export function OngletExports({ user }: { readonly user: User }) {
  return <ExportForm staff={isAdmin(user.roles) || isAgent(user.roles)} />;
}
