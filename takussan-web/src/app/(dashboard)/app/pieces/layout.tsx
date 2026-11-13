import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';

/**
 * Frontière de dictionnaire de « Vos pièces » (`/app/pieces`, TCK-2614 ; ADR-0022, amendement du 2026-10-25).
 *
 * Elle ne sert que les espaces que l'écran lit et que la coque de `/app` ne sert pas : `IntlProvider` les ajoute au
 * dictionnaire du parent. Sans elle, ils entreraient dans le document de tous les écrans de `/app`.
 */
export default async function Layout({ children }: { readonly children: React.ReactNode }) {
  return <IntlProvider messages={await messagesPour('(dashboard)/app/pieces')}>{children}</IntlProvider>;
}
