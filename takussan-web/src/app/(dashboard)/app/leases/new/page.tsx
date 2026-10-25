import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';
import { CreateLeaseForm } from '@/components/leases/CreateLeaseForm';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.leaseNew');
  return { title: t('metaTitle') };
}

/** P48.03 (TCK-2352) — `?booking_id=…` : le bail tiré d'une candidature, prérempli. */
function reservationDemandee(valeur: string | string[] | undefined): number | undefined {
  const brut = Array.isArray(valeur) ? valeur[0] : valeur;
  const id = Number(brut);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations('dashboard.pages.leaseNew');
  await getMeAction();
  const bookingId = reservationDemandee((await searchParams).booking_id);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <CreateLeaseForm bookingId={bookingId} />
    </div>
  );
}
