import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';

/**
 * Frontière de dictionnaire de la section `messages` de `/app` (ADR-0022, amendement du 2026-10-25).
 *
 * TCK-2632 — la colonne de contexte du bureau lit le statut du bien, l'étape du client, le statut
 * du bail et celui de l'intervention : des espaces que la coque de `/app` ne sert pas.
 * `IntlProvider` les ajoute au dictionnaire du parent ; sans ce layout, ils entreraient dans le
 * document de tous les écrans de `/app` (règle E de `scripts/check-i18n-namespaces.mjs`).
 */
export default async function Layout({ children }: { readonly children: React.ReactNode }) {
  return <IntlProvider messages={await messagesPour('(dashboard)/app/messages')}>{children}</IntlProvider>;
}
