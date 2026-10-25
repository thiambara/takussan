import type { Metadata } from 'next';
import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';
import { ToastProvider, Toaster } from '@/components/ui/toast';

/**
 * TCK-926 (P34.05) — interdit aux robots (`CHEMINS_INTERDITS_AUX_ROBOTS`), et `noindex` en plus :
 * `Disallow` empêche l'exploration, pas l'indexation d'une URL liée de l'extérieur.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * i18n (TCK-337) : frontière de dictionnaire du sous-arbre `/onboarding`. Sert les espaces des six
 * assistants que le socle racine ne sert pas ; `IntlProvider` les ajoute au dictionnaire du parent
 * (amendement d'ADR-0022 du 2026-10-25) — cf. `src/i18n/IntlProvider.tsx`.
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
