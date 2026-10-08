import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { PageHeader } from '@/components/console';
import { ReconciliationClient } from '@/components/admin/reconciliation/ReconciliationClient';
import { NoAgencyState } from '@/components/shared/NoAgencyState';

/**
 * TCK-593 (Partie 4) — `/admin/finances/reconciliation`, le rapprochement bancaire de l'agence.
 * Le rôle admin est exigé par `admin/layout.tsx` ; cette page n'exige qu'une agence résolue.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const t = await getTranslations('admin.reconciliation');
  const user = await getMeAction();
  // Le rôle est jugé par `admin/layout.tsx` ; l'API rejuge chaque appel (`BankStatementPolicy`).
  const agencyId = user.agency_id;
  if (!agencyId) return <NoAgencyState title={t('title')} />;

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <ReconciliationClient agencyId={agencyId} />
    </div>
  );
}
