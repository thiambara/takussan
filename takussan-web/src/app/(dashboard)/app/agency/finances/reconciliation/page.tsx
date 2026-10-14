import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { PageHeader } from '@/components/console';
import { ReconciliationClient } from '@/components/admin/reconciliation/ReconciliationClient';
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.reconciliation');
  return { title: t('title') };
}

/**
 * TCK-593 (Partie 4) — `/app/agency/finances/reconciliation`, le rapprochement bancaire de l'agence.
 * Le rôle admin est exigé par `garderPageAdmin` ; cette page n'exige qu'une agence résolue.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // TCK-633 — la page juge son accès (`PAGES_ADMIN`) ; l'API rejuge chaque appel (`BankStatementPolicy`).
  await garderPageAdmin('/app/agency/finances/reconciliation');
  const t = await getTranslations('admin.reconciliation');
  const user = await getMeAction();
  // Le rôle est jugé par `garderPageAdmin` ; l'API rejuge chaque appel (`BankStatementPolicy`).
  const agencyId = user.agency_id;
  if (!agencyId) return <NoAgencyState title={t('title')} />;

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <ReconciliationClient agencyId={agencyId} />
    </div>
  );
}
