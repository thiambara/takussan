import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import { isAdmin, isSuperAdmin } from '@/lib/roles';
import { AdminFinancesClient } from './AdminFinancesClient';
import { getTranslations } from 'next-intl/server';

/**
 * TCK-134 — `/admin/finances` agency-scoped finance overview. The
 * `(dashboard)/admin` shell already enforces the admin role gate but we
 * re-check here so a stale `/app/...` link can't leak the page shell to
 * a non-admin user.
 *
 * Routing logic (cf. ticket "Impact TCK-138 → TCK-146"):
 *   1. super_admin without an active agency context → redirect to
 *      `/super-admin` (no NoAgencyState — the platform view lives there).
 *   2. agency_admin (or super_admin browsing as a profile) without any
 *      resolvable agency → render `NoAgencyState`.
 *   3. otherwise mount the client which fetches KPIs + tables.
 *
 * Permissions: `agency_admin` and the super_admin pseudo-role both have
 * the finance permissions in our simplified RBAC. The client component
 * receives a `canViewFinances` flag derived from the role array — keeps
 * the gate purely declarative without prop-drilling the permissions list.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const t = await getTranslations('admin.pages.finances');
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/app/profile');

  const superAdmin = isSuperAdmin(user.roles);
  const hasAgencyContext = Boolean(user.agency_id);

  if (superAdmin && !hasAgencyContext) {
    redirect('/super-admin');
  }

  if (!hasAgencyContext) {
    return <NoAgencyState title={t('noAgency')} />;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>
      <AdminFinancesClient canViewFinances canEmitFinances />
    </div>
  );
}
