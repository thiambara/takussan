import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { PageHeader } from '@/components/console';
import { StatementDetail } from '@/components/admin/reconciliation/StatementDetail';
import { NoAgencyState } from '@/components/shared/NoAgencyState';

/** TCK-593 (Partie 4) — le détail d'un relevé bancaire et le rapprochement de ses lignes. */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ statementId: string }> }) {
  const { statementId } = await params;
  const id = Number(statementId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const t = await getTranslations('admin.reconciliation');
  const user = await getMeAction();
  // Le rôle est jugé par `admin/layout.tsx` ; l'API rejuge chaque appel (`BankStatementPolicy`).
  const agencyId = user.agency_id;
  if (!agencyId) return <NoAgencyState title={t('title')} />;

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />
      <StatementDetail agencyId={agencyId} statementId={id} />
    </div>
  );
}
