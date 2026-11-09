import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { CoqueDeLien } from '@/components/lien-public/CoqueDeLien';
import { SearchAlertLinkAction } from '@/components/search-alerts/SearchAlertLinkAction';

/**
 * `/[locale]/search-alerts/confirm?token=…` — TCK-599 (ADR-0050 §4) : le lien de confirmation
 * d'une alerte sans compte. Confirmer est un clic, jamais le chargement de la page.
 *
 * TCK-2514 : dans la coque de lien nue ; la carte porte son titre.
 *
 * Jamais indexée, et `no-referrer` : le jeton est dans l'URL, un `Referer` le porterait vers tout
 * lien sortant de la page.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('search.alertPages.confirm');
  return {
    title: t('metaTitle'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

function premier(valeur: string | string[] | undefined): string | null {
  return typeof valeur === 'string' ? valeur : null;
}

export default async function SearchAlertConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  return (
    <CoqueDeLien>
      <SearchAlertLinkAction mode="confirm" token={premier(params.token)} />
    </CoqueDeLien>
  );
}
