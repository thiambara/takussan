import type { ReactNode } from 'react';

import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';
import { ToastProvider, Toaster } from '@/components/ui/toast';

/**
 * `/publish` n'avait pas de layout, et n'en avait pas besoin — jusqu'à TCK-337.
 *
 * Sans frontière propre, ses fichiers relevaient du provider RACINE : les espaces de noms que la
 * page de redirection atteint (`publishRedirect`, `profile`, `ui`) étaient donc servis à TOUTES
 * les pages du produit. Mesuré : le socle passait de 8,2 % à 13,7 % du dictionnaire gzippé,
 * c'est-à-dire ~3,3 ko payés sur chaque document du site pour une page de transit.
 *
 * Il monte aussi le fournisseur de toasts : depuis TCK-625, la page bascule le profil actif par
 * `useSwitchActiveProfile`, qui annonce la bascule par un toast. Sans fournisseur, base-ui lève
 * (« Base UI error #73 ») DÈS LE RENDU — `/publish` tombait sur la frontière d'erreur, relevé sur
 * preview le 2026-10-10. `/publish` est hors des quatre coques qui en montent un.
 */
export default async function PublishLayout({ children }: { children: ReactNode }) {
  return (
    <IntlProvider messages={await messagesPour('publish')}>
      <ToastProvider>
        {children}
        <Toaster />
      </ToastProvider>
    </IntlProvider>
  );
}
