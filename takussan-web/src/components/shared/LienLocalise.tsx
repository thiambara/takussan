'use client';

import NextLink from 'next/link';
import { useLocale } from 'next-intl';
import { forwardRef, type ComponentProps } from 'react';

import { hrefLocalise } from '@/i18n/navigation';
import type { Locale } from '@/i18n/config';

type Props = Omit<ComponentProps<typeof NextLink>, 'href'> & { href: string };

/**
 * Le `<Link>` du site public — [ADR-0026](../../../docs/adr/0026-la-langue-est-un-segment-d-url-sur-la-surface-publique.md).
 *
 * Identique à `next/link` à un détail près : le `href` traverse {@link hrefLocalise}, qui ajoute la
 * langue courante aux seuls chemins de la surface publique et laisse tout le reste intact
 * (`/app/…`, `/api/…`, `https://…`, `#ancre`).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUI ARRIVE À UN LIEN QUI NE L'UTILISE PAS
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Il **fonctionne encore** : `src/proxy.ts` redirige `/properties/x` en 307 vers
 * `/<langue>/properties/x`, la langue étant celle du cookie. Le coût est un aller-retour de plus,
 * pas une page cassée.
 *
 * C'est délibéré, et c'est la raison pour laquelle la migration des ~50 fichiers portant un lien
 * public n'est pas un préalable : faire dépendre la JUSTESSE du produit d'une exhaustivité qu'on ne
 * peut pas garantir, sur un dépôt où d'autres agents écrivent en même temps, aurait produit des
 * pages muettes plutôt qu'un aller-retour visible dans l'onglet réseau.
 */
export const LienLocalise = forwardRef<HTMLAnchorElement, Props>(function LienLocalise(
  { href, ...props },
  ref,
) {
  const locale = useLocale() as Locale;
  return <NextLink ref={ref} href={hrefLocalise(href, locale)} {...props} />;
});
