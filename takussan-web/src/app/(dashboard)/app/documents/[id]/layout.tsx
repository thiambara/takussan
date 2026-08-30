import type { ReactNode } from 'react';

import { exigerRessource } from '@/lib/detail/ressource-de-detail';

/**
 * TCK-442 — **l'introuvable se décide ICI, et c'est la seule place où il rend 404.**
 *
 * Le `notFound()` vivait dans `page.tsx`, sous le `loading.tsx` de ce segment : mesuré sur le
 * Next 16.3.1 du dépôt, un `notFound()` de page sous un repli rend **200** — et l'écran
 * introuvable est affiché quand même. Neuf pages de détail étaient dans ce cas, et le défaut est
 * plus vieux que le `loading.tsx` qui le révèle (cf. l'en-tête de `ressource-de-detail.ts`).
 *
 * Depuis un layout, le même appel rend **404 malgré le repli du même segment**, et le repli
 * continue de couvrir la page : le squelette de TCK-382 n'est pas payé pour ce statut. C'est la
 * raison pour laquelle le `loading.tsx` du segment PARENT a dû descendre dans un groupe
 * `(liste)` — un repli d'ANCÊTRE, lui, efface le statut du layout aussi.
 *
 * ⚠ Ce layout ne rend rien : il n'a donc pas besoin de squelette, et il n'en ouvre aucun.
 * `exigerRessource` est mémoïsé par `cache()` : la page qui relit la même ressource partage la
 * promesse, sans second aller-retour.
 */
export default async function Layout({
  params,
  children,
}: {
  readonly params: Promise<{ id: string }>;
  readonly children: ReactNode;
}) {
  await exigerRessource('documents', (await params).id);
  return <>{children}</>;
}
