import type { ReactNode } from 'react';

import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';

/**
 * `/publish` n'avait pas de layout, et n'en avait pas besoin — jusqu'à TCK-337.
 *
 * Sans frontière propre, ses fichiers relevaient du provider RACINE : les espaces de noms que la
 * page de redirection atteint (`publishRedirect`, `profile`, `ui`) étaient donc servis à TOUTES
 * les pages du produit. Mesuré : le socle passait de 8,2 % à 13,7 % du dictionnaire gzippé,
 * c'est-à-dire ~3,3 ko payés sur chaque document du site pour une page de transit.
 *
 * Ce fichier n'existe que pour rendre ce sous-arbre autonome. Il n'ajoute aucune chrome.
 */
export default async function PublishLayout({ children }: { children: ReactNode }) {
  return <IntlProvider messages={await messagesPour('publish')}>{children}</IntlProvider>;
}
