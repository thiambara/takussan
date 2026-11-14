import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ContactLeadsInbox } from '@/components/leads/ContactLeadsInbox';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('contactLeads');
  return { title: t('title') };
}

/**
 * TCK-590 — la boîte « Demandes » : les messages laissés sur le site public. TCK-2584 — son en-tête
 * (le sous-titre compte les demandes, le bandeau des délais) est rendu par la boîte, qui lit ces
 * comptes.
 */
export default async function Page() {
  return <ContactLeadsInbox />;
}
