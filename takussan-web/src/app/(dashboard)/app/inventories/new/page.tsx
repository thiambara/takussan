import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { InventoryForm, InventoryLeasePicker } from '@/components/inventory';
import { PageHeader } from '@/components/console';

interface PageProps {
  readonly searchParams: Promise<{ lease?: string }>;
}

/**
 * Creation page. Requires `?lease=<leaseId>` — the backend derives the
 * property and the tenant from the lease, so we never ask the user to
 * pick them independently.
 */
export default async function Page({ searchParams }: PageProps) {
  const t = await getTranslations('inventory.new');
  await getMeAction();
  const { lease } = await searchParams;
  const leaseId = lease ? Number(lease) : NaN;

  // TCK-379 — sans bail, cet écran affichait « Aucun bail sélectionné » et un bouton vers
  // `/app/leases` : un cul-de-sac. Il montre désormais les baux à inventorier, ce qui rend la
  // destination du nouveau bouton de `/app/inventories` réelle plutôt que nominale.
  if (!Number.isInteger(leaseId) || leaseId <= 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('pickLeaseTitle')} description={t('pickLeaseSubtitle')} />
        <InventoryLeasePicker />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('formTitle')} description={t('formSubtitle')} />
      <InventoryForm leaseId={leaseId} />
    </div>
  );
}
