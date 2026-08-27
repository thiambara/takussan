import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { VisitDetail } from '@/components/visits/VisitDetail';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.visitDetail');
  return { title: t('metaTitle') };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await getMeAction();
  const { id } = await params;
  const visitId = Number(id);

  // Aucune garde n'existait ici : `Number('abc')` donnait `NaN`, transmis tel quel à `VisitDetail`
  // qui interrogeait `/api/property-visits/NaN`.
  if (!Number.isFinite(visitId) || visitId <= 0) notFound();

  return (
    <div className="space-y-6">
      <VisitDetail id={visitId} />
    </div>
  );
}
