import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';
import { ToastProvider, Toaster } from '@/components/ui/toast';

/**
 * i18n (TCK-337) : frontière de dictionnaire du sous-arbre `/onboarding`. Sert l'ensemble CUMULÉ
 * (socle racine + espaces des six assistants), parce qu'un provider imbriqué REMPLACE celui de
 * son parent au lieu de le compléter — cf. `src/i18n/IntlProvider.tsx`.
 */
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <IntlProvider messages={await messagesPour('onboarding')}>
      <ToastProvider>
        {children}
        <Toaster />
      </ToastProvider>
    </IntlProvider>
  );
}
