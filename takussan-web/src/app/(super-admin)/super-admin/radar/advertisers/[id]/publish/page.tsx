import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { RadarPublication } from '@/components/admin/super/radar/publication/RadarPublication';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('superAdmin.pages.radar.publication');
  return { title: t('metaTitle') };
}

type Params = Promise<{ id: string }>;

/**
 * TCK-2389 (ADR-0077 §6) — « Publier pour lui » : vérification, confirmation et récapitulatif de la publication des
 * annonces d'un annonceur. Un identifiant qui n'est pas un entier positif est un 404 ; l'écran exige
 * `platform.radar.publish` (`super_admin`), et l'API refuse (403) sans lui.
 */
export default async function SuperAdminRadarPublishPage({ params }: { params: Params }) {
  const { id } = await params;
  const advertiserId = Number(id);

  if (!Number.isInteger(advertiserId) || advertiserId <= 0) {
    notFound();
  }

  return <RadarPublication id={advertiserId} />;
}
