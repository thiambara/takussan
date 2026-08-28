import type { MetadataRoute } from 'next';

import { ORIGINE_SITE } from '@/lib/alternates';
import { CHEMINS_INTERDITS_AUX_ROBOTS } from '@/lib/sitemap';

/**
 * `/robots.txt` — TCK-431.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE `Disallow` FAIT, ET CE QU'IL NE FAIT PAS
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Il empêche l'EXPLORATION, pas l'indexation. Une URL interdite ici mais liée depuis l'extérieur
 * peut encore apparaître dans un index, sans description — et, surtout, un moteur qui a
 * l'interdiction de la charger **ne lira jamais son `noindex`**. C'est pourquoi `/playground` ne
 * figure PAS dans cette liste : sa page déclare `robots: { index: false }`, et l'interdire ici
 * empêcherait précisément qu'on le sache. *Les deux mécanismes ne s'additionnent pas, ils
 * s'annulent.*
 *
 * Les chemins interdits sont ceux des surfaces internes — console, BFF, authentification,
 * onboarding, publication —, et ils se DÉRIVENT de `SEGMENTS_NON_LOCALISES` (`src/i18n/routing.ts`)
 * plutôt que d'être recopiés : c'est la même liste, elle vit à un seul endroit, et le jour où une
 * surface interne s'y ajoute elle est interdite sans que personne y pense. Deux segments en sont
 * SOUSTRAITS explicitement — `_next` et `_vercel`, qui portent le CSS et le JS : un moteur qui ne
 * peut pas les charger juge une page sans style et sans contenu.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [...CHEMINS_INTERDITS_AUX_ROBOTS],
      },
    ],
    // Absolu, sur l'origine résolue une seule fois par `src/lib/alternates.ts`. Un `Sitemap:`
    // relatif n'est pas suivi.
    sitemap: `${ORIGINE_SITE}/sitemap.xml`,
  };
}
