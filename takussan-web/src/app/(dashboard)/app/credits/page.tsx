import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { PageCredits } from '@/components/credits/PageCredits';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('credits');
  return { title: t('metaTitle') };
}

/**
 * TCK-633 lot F (ADR-0061 §1) — le portefeuille de crédits de l'espace actif ; TCK-2664 — « vendre
 * la mise en avant » : l'en-tête vit dans le client, qui choisit le téléphone ou le bureau. L'API
 * tranche l'accès (403 : la page le dit, `PageCredits`).
 */
export default function Page() {
  return <PageCredits />;
}
