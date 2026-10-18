import type { MetadataRoute } from 'next';

import { origineSite } from '@/lib/alternates';
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
/**
 * ⚠ Rendu à la demande, et non au build : `Sitemap:` porte l'origine du site, qui se lit à
 * l'EXÉCUTION (`SITE_URL`, ADR-0069 § 3). Prérendu, ce fichier citerait le sitemap de l'origine de
 * la machine de build — `www.takussan.com`, le défaut — depuis la préproduction.
 */
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [...CHEMINS_INTERDITS_AUX_ROBOTS],
      },
    ],
    // Absolu, sur l'origine que décide `src/lib/config-publique.ts`. Un `Sitemap:` relatif n'est
    // pas suivi.
    sitemap: `${origineSite()}/sitemap.xml`,
  };
}
