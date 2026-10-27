import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { RadarConsole } from '@/components/admin/super/radar/RadarConsole';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('superAdmin.pages.radar');
  return { title: t('metaTitle') };
}

/**
 * TCK-2386 (ADR-0077) — le Radar : les annonces repérées ailleurs, saisies à la main, extraites par
 * l'IA, puis relues. Le layout de la console garde l'entrée ; l'API rend 403 sans le geste
 * `platform.radar.operate`.
 */
export default function SuperAdminRadarPage() {
  return <RadarConsole />;
}
