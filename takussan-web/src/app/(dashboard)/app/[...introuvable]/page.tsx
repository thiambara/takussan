import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

/**
 * Jamais rendue : `layout.tsx` du segment appelle `notFound()` avant elle. Son titre l'est pourtant :
 * c'est lui que l'onglet garde après l'hydratation (TCK-2740) — le même que celui de `../not-found.tsx`.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.notFound');
  return { title: t('heading') };
}

export default function Introuvable() {
  return null;
}
