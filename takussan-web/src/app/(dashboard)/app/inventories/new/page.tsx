import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { InventoryLeasePicker } from '@/components/inventory/InventoryLeasePicker';
import { Demarrer } from '@/components/inventory/terrain/Demarrer';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.inventoryNew');
  return { title: t('metaTitle') };
}

interface PageProps {
  readonly searchParams: Promise<{ lease?: string; type?: string }>;
}

/**
 * Creation page. Requires `?lease=<leaseId>` — the backend derives the
 * property and the tenant from the lease, so we never ask the user to
 * pick them independently.
 *
 * TCK-2647 — `?lease=…&type=move_in|move_out` ouvre l'écran « Démarrer » du parcours de terrain (le
 * type, sinon déduit du bail) : les entrées de la fiche du bail, de la file « À traiter » et de la
 * fiche du bien y mènent toutes.
 */
export default async function Page({ searchParams }: PageProps) {
  const t = await getTranslations('inventory.new');
  await getMeAction();
  const { lease, type } = await searchParams;
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

  return <Demarrer leaseId={leaseId} typeDemande={type ?? null} />;
}
