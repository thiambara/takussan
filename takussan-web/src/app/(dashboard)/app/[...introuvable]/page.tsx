import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

/** Jamais rendue : `layout.tsx` du segment appelle `notFound()` avant elle. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.notFound');
  return { title: t('title') };
}

export default function Introuvable() {
  return null;
}
