import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { CoqueDeLien } from '@/components/lien-public/CoqueDeLien';
import { DigestUnsubscribeAction } from '@/components/notifications/DigestUnsubscribeAction';

/**
 * `/[locale]/notifications/unsubscribe` — P97.06 (TCK-1243, ADR-0050) : se désabonner du résumé
 * par courriel en UN bouton, depuis le lien du courriel (`?user=ID&expires=…&signature=…`, l'URL
 * signée de l'API, rejouée en `POST`).
 *
 * TCK-2514 : dans la coque de lien nue ; la carte porte son titre.
 *
 * Jamais indexée, et `no-referrer` : la signature est dans l'URL.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('search.alertPages.digest');
  return {
    title: t('metaTitle'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

function premier(valeur: string | string[] | undefined): string | null {
  return typeof valeur === 'string' ? valeur : null;
}

export default async function DigestUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  return (
    <CoqueDeLien>
      <DigestUnsubscribeAction
        user={premier(params.user)}
        expires={premier(params.expires)}
        signature={premier(params.signature)}
      />
    </CoqueDeLien>
  );
}
