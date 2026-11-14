import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Commissions } from '@/components/commissions/Commissions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('commissions');
  return { title: t('metaTitle') };
}

/**
 * TCK-595 (ADR-0049 §3) — le relevé des commissions, par bail ; TCK-2662 — « le solde d'abord » :
 * l'en-tête (« Mes commissions » ou « Commissions ») vit dans le client, qui choisit la lecture.
 */
export default function Page() {
  return <Commissions />;
}
