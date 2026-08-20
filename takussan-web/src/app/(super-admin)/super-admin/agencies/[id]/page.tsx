import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AgencyDetailPage } from '@/components/admin/super/agency-detail';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('superAdmin.pages.agencyDetail');
  return { title: t('metaTitle') };
}

type Params = Promise<{ id: string }>;

export default async function Page({ params }: { params: Params }) {
  const { id } = await params;
  const agencyId = Number(id);

  if (!Number.isInteger(agencyId) || agencyId <= 0) {
    notFound();
  }

  return <AgencyDetailPage agencyId={agencyId} />;
}
