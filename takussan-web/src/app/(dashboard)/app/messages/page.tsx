import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';

import { MessagesPage } from '@/components/messages/MessagesPage';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.messages');
  return { title: t('metaTitle') };
}

/**
 * TCK-645 — l'en-tête de page est rendu PAR `MessagesPage`, plus ici : sous `lg` il devient une
 * ligne compacte qui disparaît quand une conversation occupe l'écran, et c'est le composant client
 * qui sait laquelle est ouverte. Les libellés restent traduits côté serveur et lui sont passés.
 */
export default async function Page() {
  const t = await getTranslations('dashboard.pages.messages');
  await getMeAction();
  return <MessagesPage titre={t('title')} sousTitre={t('subtitle')} />;
}
