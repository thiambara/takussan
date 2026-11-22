import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { RadarCibleFiche } from '@/components/admin/super/radar/cibles/RadarCibleFiche';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('superAdmin.pages.radar.targets');
  return { title: t('detailMetaTitle') };
}

type Params = Promise<{ id: string }>;

/**
 * TCK-2469 (ADR-0087 §5) — la page d'une cible du Radar : ses critères, ce qu'elle a rapporté, ses annonces. Un identifiant
 * qui n'est pas un entier positif est un 404 ; l'API rend 403 sans `platform.radar.operate`.
 */
export default async function SuperAdminRadarTargetPage({ params }: { params: Params }) {
  const { id } = await params;
  const targetId = Number(id);

  if (!Number.isInteger(targetId) || targetId <= 0) {
    notFound();
  }

  return <RadarCibleFiche id={targetId} />;
}
