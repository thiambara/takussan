import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Baux' };
import { getMeAction } from '@/app/actions/auth';
import { isAgent, isAdmin, isOwner, isSuperAdmin } from '@/lib/roles';
import { LeasesList } from '@/components/leases/LeasesList';
import { NoAgencyState } from '@/components/shared/NoAgencyState';

export default async function Page() {
  const user = await getMeAction();

  // TCK-115: super_admin without agency_id gets 403 from GET /api/leases
  if (isSuperAdmin(user.roles) && !user.agency_id) {
    return <NoAgencyState title="Baux" />;
  }

  // TCK-173 — `Nouveau bail` is an agent/admin/owner action, not a customer one.
  const canCreateLease = isAgent(user.roles) || isAdmin(user.roles) || isOwner(user.roles);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-app-ink">Baux</h1>
          <p className="mt-1 text-sm text-app-ink-muted">
            Consultez et gérez vos contrats
          </p>
        </div>
        {canCreateLease && (
          <Link
            href="/app/leases/new"
            className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80"
          >
            Nouveau bail
          </Link>
        )}
      </div>
      <LeasesList />
    </div>
  );
}
