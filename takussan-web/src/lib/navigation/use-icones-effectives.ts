import { useSyncExternalStore } from 'react';
import { PLAGE_ICONES_AUTO, type ModeIcones } from './mode-icones';

function abonner(rappel: () => void): () => void {
  const requete = window.matchMedia(PLAGE_ICONES_AUTO);
  requete.addEventListener('change', rappel);
  return () => requete.removeEventListener('change', rappel);
}

/**
 * TCK-2480 — la barre est-elle réduite MAINTENANT ? Pour les infobulles et le sens de la bascule
 * seulement : jamais pour la largeur, que le CSS décide dès le premier octet. Au rendu serveur et à
 * l'hydratation, `false` en `auto` : aucune infobulle tant que la page n'est pas hydratée — une
 * infobulle n'occupe aucune place, rien ne bouge à l'œil.
 */
export function useIconesEffectives(mode: ModeIcones): boolean {
  const dansLaPlage = useSyncExternalStore(
    abonner,
    () => window.matchMedia(PLAGE_ICONES_AUTO).matches,
    () => false,
  );
  return mode === 'icones' || (mode === 'auto' && dansLaPlage);
}
