import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { RadarAdvertiserCard } from '@/components/admin/super/radar/annonceur/RadarAdvertiserCard';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('superAdmin.pages.radar.advertiser');
  return { title: t('metaTitle') };
}

type Params = Promise<{ id: string }>;

/**
 * TCK-2388 (ADR-0077) — la fiche d'un annonceur du Radar : identité, annonces, message d'accord. Un identifiant
 * qui n'est pas un entier positif est un 404 ; l'API rend 403 sans `platform.radar.operate`.
 */
export default async function SuperAdminRadarAdvertiserPage({ params }: { params: Params }) {
  const { id } = await params;
  const advertiserId = Number(id);

  if (!Number.isInteger(advertiserId) || advertiserId <= 0) {
    notFound();
  }

  return <RadarAdvertiserCard id={advertiserId} />;
}
