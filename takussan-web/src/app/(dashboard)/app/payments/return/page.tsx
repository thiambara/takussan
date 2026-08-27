import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { PaymentReturnClient } from './PaymentReturnClient';

/**
 * Enveloppe SERVEUR du retour de paiement — et sa seule raison d'être est le titre d'onglet.
 *
 * Le corps de cette page est irréductiblement client : il sonde la vérification du paiement,
 * lit `useSearchParams()` et tient un budget de relance. Or Next **interdit** à un module
 * `'use client'` d'exporter `generateMetadata` — c'est la contrainte du cadre, pas un choix.
 *
 * Deux issues existaient, et le coût a tranché :
 *
 *   · un `layout.tsx` de segment portant le titre. Écarté : `scripts/check-i18n-namespaces.mjs`
 *     traite TOUT `layout.tsx` comme une frontière de dictionnaire, qui doit alors servir son
 *     propre sous-ensemble. Mesuré : la frontière aurait dû déclarer **38 espaces de noms**,
 *     c'est-à-dire recopier intégralement celui de son parent pour un provider imbriqué qui
 *     n'aurait rien ajouté.
 *   · cette scission. Le composant client est déplacé dans `PaymentReturnClient.tsx` et cette
 *     enveloppe ne fait rien d'autre que le monter.
 *
 * ⚠ Le déplacement était un `git mv` au caractère près sur la branche de TCK-382 ; à la fusion,
 * c'est la version de TCK-380/381 du corps qui a été retenue — celle portée sur `PageHeader` et
 * sur les jetons de couleur. Le seul écart avec elle est le nom de l'export.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.paymentReturn');
  return { title: t('metaTitle') };
}

export default function Page() {
  return <PaymentReturnClient />;
}
