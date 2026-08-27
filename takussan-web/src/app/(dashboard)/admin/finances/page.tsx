import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { fetchAgencyAction } from '@/app/actions/admin-agency';
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import { isAdmin, isSuperAdmin } from '@/lib/roles';
import { AdminFinancesClient } from './AdminFinancesClient';
import { PageHeader } from '@/components/console';
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
  const agencyId = user.agency_id;

  if (superAdmin && !agencyId) {
    redirect('/super-admin');
  }

  if (!agencyId) {
    return <NoAgencyState title={t('noAgency')} />;
  }

  // TCK-370 — le taux de commission par défaut du dialogue de reversement.
  //
  // ⚠ Le ticket annonçait `/api/dashboard/agency` comme source ; c'est FAUX, et cette page ne
  // monte pas cet endpoint. `DashboardAgencyService` rend `finance.commission_month`, une SOMME
  // de `leases.commission_amount` sur le mois — jamais un taux. Le taux vit sur
  // `agencies.commission_rate`, déjà présent dans `AGENCY_ADMIN_FIELDS` et déjà servi par
  // `fetchAgencyAction`, celui-là même que `/admin/agency` utilise pour pré-remplir son champ
  // « Commission ». Les deux écrans lisent donc la même colonne.
  //
  // Une agence illisible (403/404) ne casse pas la page : la prop reste absente et le dialogue
  // reprend son ancien comportement.
  const agence = await fetchAgencyAction(agencyId);
  const defaultCommissionRate =
    agence.ok && typeof agence.data?.commission_rate === 'number'
      ? agence.data.commission_rate
      : undefined;

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <AdminFinancesClient
        canViewFinances
        canEmitFinances
        defaultCommissionRate={defaultCommissionRate}
      />
    </div>
  );
}
