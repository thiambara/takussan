import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { RadarListingFiche } from '@/components/admin/super/radar/fiche/RadarListingFiche';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('superAdmin.pages.radar.listing');
  return { title: t('metaTitle') };
}

type Params = Promise<{ id: string }>;

/**
 * TCK-2387 (ADR-0077) — la fiche d'une annonce du Radar : source à gauche, champs lus à droite. Un
 * identifiant qui n'est pas un entier positif est un 404 ; l'API rend 403 sans `platform.radar.operate`.
 */
export default async function SuperAdminRadarListingPage({ params }: { params: Params }) {
  const { id } = await params;
  const listingId = Number(id);

  if (!Number.isInteger(listingId) || listingId <= 0) {
    notFound();
  }

  return <RadarListingFiche id={listingId} />;
}
