import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { RadarObservatoire } from '@/components/admin/super/radar/observatoire/RadarObservatoire';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('superAdmin.pages.radar.observatory');
  return { title: t('metaTitle') };
}

/** TCK-2393 (ADR-0083) — l'observatoire du Radar : classement des annonceurs et marché. L'API rend 403 sans `platform.radar.operate`. */
export default function SuperAdminRadarObservatoryPage() {
  return <RadarObservatoire />;
}
