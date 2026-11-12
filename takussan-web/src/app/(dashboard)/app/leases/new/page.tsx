import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';
import { CreateLeaseForm } from '@/components/leases/CreateLeaseForm';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.leaseNew');
  return { title: t('metaTitle') };
}

/**
 * P48.03 (TCK-2352) — `?booking_id=…` : le bail tiré d'une candidature, prérempli.
 * TCK-2643 — `?property=…` : le bien préchoisi, venu de sa fiche. Même lecture : un entier positif.
 */
function identifiantDemande(valeur: string | string[] | undefined): number | undefined {
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
  const parametres = await searchParams;
  const bookingId = identifiantDemande(parametres.booking_id);
  const propertyId = identifiantDemande(parametres.property);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <CreateLeaseForm bookingId={bookingId} propertyId={propertyId} />
    </div>
  );
}
