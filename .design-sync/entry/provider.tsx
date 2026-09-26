import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';

import { ToastProvider } from '../../takussan-web/src/components/ui/toast';
// Généré par build.mjs : les seuls sous-arbres `ui.*` et `common.actions` des trois locales
// (les fichiers complets pèsent ~300 Ko chacun).
import generated from './messages.generated.json';

type Locale = 'fr' | 'en' | 'wo';

/** Les sous-ensembles `ui.*` et `common.actions` des messages du produit, par locale. */
export const messages = generated as Record<Locale, Record<string, unknown>>;

/**
 * Fournit les messages next-intl (fr par défaut, en, wo ; fuseau Africa/Dakar) et le
 * `ToastProvider` aux primitives qui traduisent — `Dialog`, `Toaster`, `PhoneInput`,
 * `DatePicker`, `DateTimePicker`. Hors de l'application, envelopper l'arbre dedans.
 */
export function TakussanProvider({ locale = 'fr', children }: { locale?: Locale; children?: ReactNode }) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="Africa/Dakar">
      <ToastProvider>{children}</ToastProvider>
    </NextIntlClientProvider>
  );
}
