import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { RadarCibles } from '@/components/admin/super/radar/cibles/RadarCibles';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('superAdmin.pages.radar.targets');
  return { title: t('metaTitle') };
}

/**
 * TCK-2469 (ADR-0087 §5) — les cibles du Radar : ce que la collecte cherche, et ce que chaque cible rapporte. Le layout de
 * la console garde l'entrée ; l'API rend 403 sans `platform.radar.operate` (lecture) ou `platform.radar.publish` (écriture).
 */
export default function SuperAdminRadarTargetsPage() {
  return <RadarCibles />;
}
