'use client';

import { usePathname } from 'next/navigation';
import { useLayoutEffect } from 'react';

/**
 * Les écrans de connexion s'ouvrent EN HAUT — revue du 2026-09-23 (TCK-568, M2).
 *
 * Le défaut : arriver sur `/auth/login` depuis une recherche défilée (le menu mobile, puis
 * « Connexion ») ouvrait l'écran défilé à son maximum, et le « Retour » posé en haut du layout
 * était hors de l'écran — à 320 × 640, `top` −70 px. Le correctif du retour était invisible dans le
 * parcours même du testeur.
 *
 * La cause est une règle de Next, pas un oubli de ce dépôt : à la navigation, le routeur ne remonte
 * la fenêtre que si le haut du segment NOUVEAU LE PLUS PROFOND — la page, pas le layout — est hors
 * de l'écran (`InnerScrollHandlerNew`, `layout-router.js` : les effets courent des enfants vers les
 * parents, et le premier segment qui répond « déjà visible » clôt la navigation). Ici, la page
 * commence sous la bannière (`mt-[22vh]`) : la fenêtre, ramenée par le navigateur de 600 à 82 px
 * (le maximum d'un écran court), laisse le haut du formulaire visible, à 83 px — Next s'arrête là.
 * Le retour et le logo, au-dessus, dans le layout, restent dehors.
 *
 * D'où ce composant : l'arrivée sur un écran de `(auth)` remonte au SOMMET du document, pas au haut
 * de la page. Un écran de connexion n'a pas de position de lecture à préserver ; il a une issue à
 * montrer. `useLayoutEffect` : avant la première peinture, pour qu'on ne voie pas l'écran sauter.
 *
 * ⚠ **Un retour par l'historique n'est PAS toujours ramené en haut** — mesuré le 2026-09-24
 * (TCK-568), 320 × 640 : recherche → `/auth/login`, défilée à 82 px → « Créer un compte » → retour
 * du navigateur : `/auth/login` revient à 82 px et y reste (100, 600, 1500 ms), le « Retour » à
 * `top` −70. La position est restaurée APRÈS cet effet ; qui la restaure (navigateur ou routeur)
 * n'est pas départagé. Sur `/auth/login` chargée directement, le même geste rend 0 : le cas n'est
 * pas stable, et ce composant ne le promet pas. Gardé tel quel, délibérément : la personne revient
 * au point d'où elle est partie, en ayant défilé elle-même pour atteindre « Créer un compte » ; le
 * haut est à un geste.
 */
export function ArriveeEnHaut() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    // Une ancre visée explicitement garde la main : c'est au navigateur de la montrer.
    if (window.location.hash !== '') return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  return null;
}
