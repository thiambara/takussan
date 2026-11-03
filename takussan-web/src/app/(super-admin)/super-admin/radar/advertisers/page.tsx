import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { RadarAdvertiserList } from '@/components/admin/super/radar/annonceur/RadarAdvertiserList';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('superAdmin.pages.radar.advertisers');
  return { title: t('metaTitle') };
}

/**
 * TCK-2388 (ADR-0077) — les files d'annonceurs du Radar : à contacter, en attente, à relancer. L'API rend 403 sans
 * `platform.radar.operate` ; la liste le dit sans rien demander.
 */
export default function SuperAdminRadarAdvertisersPage() {
  return <RadarAdvertiserList />;
}
