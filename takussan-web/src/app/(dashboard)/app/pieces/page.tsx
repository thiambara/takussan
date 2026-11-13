import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { VosPieces } from '@/components/pieces/VosPieces';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pieces');
  return { title: t('titre') };
}

/**
 * TCK-2614 — « Vos pièces » : les pièces du profil actif (bailleur, agent, prestataire), ouvertes depuis l'étape
 * « Pièces » de « Démarrer » (et l'étape `kyc` du bailleur). L'écran lit lui-même `GET /api/me/pieces` : un profil sans
 * pièces (admin d'agence, client) y lit qu'il n'a rien à fournir, jamais un refus.
 */
export default function Page() {
  return <VosPieces />;
}
