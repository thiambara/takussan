import { getMeAction } from '@/app/actions/auth';
import { isAgent, isAdmin } from '@/lib/roles';
import { StubPlaceholder } from '@/components/shared/StubPlaceholder';

export default async function DashboardPage() {
  const user = await getMeAction();
  const useAgentStats = isAgent(user.roles) || isAdmin(user.roles);
  const stats = useAgentStats
    ? ['Biens actifs', 'Clients', 'Réservations', 'Commissions']
    : ['Favoris', 'Réservations', 'Baux actifs', 'Messages'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1f1b17]">Tableau de bord</h1>
        <p className="mt-1 text-sm text-[#43474e]">Vue d&apos;ensemble de votre activité</p>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((label) => (
          <div key={label} className="rounded-2xl bg-[#fcf2eb] p-6">
            <p className="text-xs font-semibold text-[#43474e]">{label}</p>
            <p className="mt-2 text-2xl font-bold text-[#1f1b17]">—</p>
          </div>
        ))}
      </div>
      <StubPlaceholder label="Tableau de bord" />
    </div>
  );
}
