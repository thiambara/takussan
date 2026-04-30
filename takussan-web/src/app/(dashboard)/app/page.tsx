import { getMeAction } from '@/app/actions/auth';
import { isAgent, isAdmin, isSuperAdmin } from '@/lib/roles';
import { StubPlaceholder } from '@/components/shared/StubPlaceholder';
import { NoAgencyState } from '@/components/shared/NoAgencyState';

export default async function DashboardPage() {
  const user = await getMeAction();

  // TCK-115: super_admin without agency_id has no data to display
  if (isSuperAdmin(user.roles) && !user.agency_id) {
    return <NoAgencyState title="Tableau de bord" />;
  }

  const useAgentStats = isAgent(user.roles) || isAdmin(user.roles);
  const stats = useAgentStats
    ? ['Biens actifs', 'Clients', 'Réservations', 'Commissions']
    : ['Favoris', 'Réservations', 'Baux actifs', 'Messages'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-ink">Tableau de bord</h1>
        <p className="mt-1 text-sm text-app-ink-muted">Vue d&apos;ensemble de votre activité</p>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((label) => (
          <div key={label} className="rounded-2xl bg-app-surface-1 p-6">
            <p className="text-xs font-semibold text-app-ink-muted">{label}</p>
            <p className="mt-2 text-2xl font-bold text-app-ink">—</p>
          </div>
        ))}
      </div>
      <StubPlaceholder label="Tableau de bord" />
    </div>
  );
}
