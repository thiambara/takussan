import { getMeAction } from '@/app/actions/auth';
import { isSuperAdmin } from '@/lib/roles';
import { VisitsList } from '@/components/visits/VisitsList';
import { NoAgencyState } from '@/components/shared/NoAgencyState';

export const metadata = {
  title: 'Mes visites',
};

export default async function Page() {
  const user = await getMeAction();

  // TCK-115: super_admin without agency_id gets 403 from GET /api/visits
  if (isSuperAdmin(user.roles) && !user.agency_id) {
    return <NoAgencyState title="Visites" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Visites</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Planifiez et suivez vos visites.
        </p>
      </div>
      <VisitsList />
    </div>
  );
}
