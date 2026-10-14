import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@/components/console';
import { AdminCreditWalletDetail } from '@/components/boost/admin/AdminCreditWalletDetail';

type Params = Promise<{ agencyId: string }>;

/** TCK-633 lot F (ADR-0061 §2) — le portefeuille d'un espace : lots, journal, ajustement. */
export default async function Page({ params }: { params: Params }) {
  const { agencyId } = await params;
  const id = Number(agencyId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const t = await getTranslations('superAdmin.credits');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <AdminCreditWalletDetail agencyId={id} />
    </div>
  );
}
