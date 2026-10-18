import type { Metadata } from 'next';
import { Fraunces, Inter, Manrope } from 'next/font/google';
import { notFound } from 'next/navigation';

import { PlaygroundClient } from './PlaygroundClient';

/**
 * `/‹langue›/playground` — **le POC reste, son indexabilité part** (TCK-431, AC4).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ TRANCHÉ, ET POURQUOI PAS AUTREMENT
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le ticket laissait trois issues : retrait, déplacement hors du groupe `(public)`, ou `noindex`
 * explicite. Les deux premières sont écartées par une mesure, pas par un goût :
 *
 * · **Le retrait est interdit par la documentation qui fait autorité.** `docs/design-guidelines.md`
 *   § « Outils de dev — /playground » et TCK-129 (« POC visible sur `/playground`, à conserver
 *   comme outil de dev ») en font une référence vivante du design system. Les six palettes non
 *   retenues et les deux typographies alternatives n'existent nulle part ailleurs.
 * · **Le déplacement hors de `[locale]/(public)` coûte plus qu'il ne rend.** Tout `layout.tsx`
 *   ajouté sous ce groupe devient une FRONTIÈRE DE DICTIONNAIRE (ADR-0022) : il devrait appeler
 *   `messagesPour(...)` et faire régénérer `src/i18n/namespaces.json`, une table dérivée et
 *   partagée. Beaucoup de surface remuée pour une page de démonstration.
 *
 * Reste le `noindex`, qui est de toute façon le mécanisme JUSTE : il dit au moteur ce qu'il en est
 * de cette page, au lieu de la cacher. Il couvre les trois URL d'un coup (`/fr/playground`,
 * `/en/playground`, `/wo/playground`), il écrase `robots: { index: true, follow: true }`, la
 * valeur par défaut — le layout du groupe ne la déclare plus depuis TCK-915 —
 * et il est ÉPROUVABLE depuis le fichier, ce que l'AC exige explicitement.
 *
 * ⚠️ `/playground` n'est PAS interdit dans `robots.txt`, et c'est délibéré : un moteur qui a
 * l'interdiction de charger l'URL ne lit jamais le `noindex` qu'elle porte. Cf. `src/app/robots.ts`.
 *
 * Cette page n'a pas d'`alternates` non plus : déclarer des `hreflang` reviendrait à proposer au
 * moteur trois versions d'une page qu'on vient de lui demander de ne pas indexer.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * TCK-742 (P33.01) — les familles que seul le playground lit sont déclarées ICI, et non au layout
 * racine : une police déclarée par une page n'est préchargée que par elle, quand celles de la
 * racine l'étaient par les 139 routes. Bricolage et DM Sans restent posées par la racine.
 * `display: contents` : l'enveloppe ne porte que les variables, sans boîte.
 */
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', weight: ['400', '500', '600'], style: ['normal', 'italic'] });

/**
 * TCK-794 (P18.06, décision du porteur) — **retiré des environnements déployés** : le playground
 * appelle la recherche publique pour ses rangées « près de toi » et « location », et chaque
 * affichage comptait des impressions sponsorisées qu'il ne montre pas. Toute image déployée est
 * construite en production (`next build`) : la page y rend 404. Elle reste l'outil de développement
 * que décrivent `docs/design-guidelines.md` et TCK-129, sous `next dev`.
 */
export default function PlaygroundPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <div className={`contents ${manrope.variable} ${inter.variable} ${fraunces.variable}`}>
      <PlaygroundClient />
    </div>
  );
}
