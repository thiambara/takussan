import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { CoqueDeLien } from '@/components/lien-public/CoqueDeLien';
import { SearchAlertLinkAction } from '@/components/search-alerts/SearchAlertLinkAction';

/**
 * `/[locale]/search-alerts/unsubscribe` — TCK-599 (ADR-0050 §4, contrainte 6) : la désinscription
 * en UN bouton, depuis le lien d'un e-mail d'alerte. Deux formes de lien :
 *
 * - `?token=…` — un abonné sans compte : toutes ses alertes s'arrêtent, son contact est effacé ;
 * - `?search=ID&expires=…&signature=…` — l'alerte d'un compte : l'URL signée de l'API, rejouée
 *   en `POST` ; la recherche reste, son alerte passe à `off`.
 *
 * TCK-2514 : dans la coque de lien nue ; la carte porte son titre.
 *
 * Jamais indexée, et `no-referrer` : le jeton ou la signature sont dans l'URL.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('search.alertPages.unsubscribe');
  return {
    title: t('metaTitle'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

function premier(valeur: string | string[] | undefined): string | null {
  return typeof valeur === 'string' ? valeur : null;
}

export default async function SearchAlertUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  return (
    <CoqueDeLien>
      <SearchAlertLinkAction
        mode="unsubscribe"
        token={premier(params.token)}
        search={premier(params.search)}
        expires={premier(params.expires)}
        signature={premier(params.signature)}
      />
    </CoqueDeLien>
  );
}
