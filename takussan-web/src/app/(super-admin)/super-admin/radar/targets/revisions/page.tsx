import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { RevisionsDemande } from '@/components/admin/super/radar/cibles/RevisionsDemande';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('superAdmin.pages.radar.targets.revisions');
  return { title: t('metaTitle') };
}

/**
 * TCK-2470 (ADR-0087 §6) — l'historique des révisions des cibles de la demande. Segment statique : il passe avant
 * `targets/[id]`, comme `GET targets/revisions` passe avant `targets/{target}` côté API. L'API rend 403 sans
 * `platform.radar.operate` (lecture) ou `platform.radar.publish` (défaire).
 */
export default function SuperAdminRadarTargetRevisionsPage() {
  return <RevisionsDemande />;
}
