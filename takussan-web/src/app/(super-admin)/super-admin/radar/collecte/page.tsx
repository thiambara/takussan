import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { RadarCollecte } from '@/components/admin/super/radar/collecte/RadarCollecte';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('superAdmin.pages.radar.crawl');
  return { title: t('metaTitle') };
}

/**
 * TCK-2392 (ADR-0077 §10) — la collecte automatique du Radar : les sites lus d'office et leurs passages. Le layout de la
 * console garde l'entrée ; l'API rend 403 sans `platform.radar.operate` (lecture) ou `platform.radar.publish` (réglage).
 */
export default function SuperAdminRadarCollectePage() {
  return <RadarCollecte />;
}
