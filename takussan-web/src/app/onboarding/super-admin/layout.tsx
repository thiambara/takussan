import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';

/**
 * i18n (TCK-337, ADR-0022 amendement du 2026-10-25, règle E) : l'assistant du super-admin coopté est sa propre
 * frontière de dictionnaire. Il est le seul des sept assistants de `/onboarding` à lire `superAdmin`, le plus gros
 * espace de noms ; servi par la frontière `onboarding`, il s'ajoutait au document des six autres, qui n'en lisent
 * rien. `IntlProvider` ajoute ces espaces à ceux du parent ; le `ToastProvider` du parent sert déjà cette page.
 */
export default async function SuperAdminOnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <IntlProvider messages={await messagesPour('onboarding/super-admin')}>{children}</IntlProvider>;
}
