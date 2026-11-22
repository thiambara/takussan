import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { VitrineClient } from './VitrineClient';

/**
 * `/‹langue›/playground/vitrine` — LA VITRINE DE LA PARTIE CONNECTÉE (TCK-2685, ADR-0106 § 5).
 *
 * Elle rend, sous la portée `/app` (`data-portee-app`), chaque jeton de TCK-2685 — échelle de texte,
 * interlignes, icônes aux deux traits, ombres, encres, formats, point de rupture — puis, au fil de
 * TCK-2686 à TCK-2691, chaque primitive dans chacun de ses états. C'est l'écran que l'outil de
 * fidélité (TCK-2684) relève pour éprouver une primitive HORS DE TOUTE DONNÉE : la base de démo
 * dérive, la vitrine non.
 *
 * Elle vit à côté du POC du playground, et en reprend les deux règles (TCK-431, TCK-794) : `noindex`,
 * et 404 dans toute construction de production. Jamais sous `playground/maquettes/` : ce dossier est
 * local et exclu de git, la vitrine est versionnée.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function VitrinePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <VitrineClient />;
}
