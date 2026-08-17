import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { FileSearch } from 'lucide-react';

import { getMeAction } from '@/app/actions/auth';
import { EmptyState } from '@/components/feedback';
import { InventoryForm } from '@/components/inventory';
import { buttonVariants } from '@/components/ui/button';

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

  if (!Number.isInteger(leaseId) || leaseId <= 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">{t('pickLeaseTitle')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('pickLeaseSubtitle')}</p>
        </div>
        <EmptyState
          icon={<FileSearch className="size-8" aria-hidden="true" />}
          title={t('no_lease_title')}
          description={t('no_lease_description')}
          action={
            <Link href="/app/leases" className={buttonVariants()}>
              {t('no_lease_cta')}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">{t('formTitle')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('formSubtitle')}</p>
      </div>
      <InventoryForm leaseId={leaseId} />
    </div>
  );
}
