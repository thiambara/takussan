import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';
import { ContactLeadsInbox } from '@/components/leads/ContactLeadsInbox';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('contactLeads');
  return { title: t('title') };
}

/** TCK-590 — la boîte « Demandes » : les messages laissés sur le site public. */
export default async function Page() {
  const t = await getTranslations('contactLeads');
  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />
      <ContactLeadsInbox />
    </div>
  );
}
