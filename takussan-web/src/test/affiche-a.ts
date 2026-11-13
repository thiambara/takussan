/**
 * Harnais de test — un élément est-il AFFICHÉ à une largeur donnée, d'après ses classes Tailwind ?
 *
 * jsdom n'applique pas Tailwind : une barre `hidden lg:flex` y est toujours « présente ». Cette fonction
 * rejoue les seules utilitaires d'affichage (`hidden`, `block`, `flex`, `inline-flex`, `grid`) avec leurs
 * préfixes `lg:` (1024) et `xl:` (1280), sur l'élément ET ses ancêtres. Elle ne voit ni `sm:`/`md:`, ni
 * `style=`, ni les variantes composées (`lg:max-xl:`) : un élément qui en dépend se mesure au navigateur.
 *
 * Extraite de `CoqueDEntree.panneau-xl.tck-2604.test.tsx` quand un second fichier en a eu besoin
 * (le titre de la barre du bureau à 1024, TCK-2604).
 */
const PALIERS: readonly (readonly [string, number])[] = [
  ['', 0],
  ['lg:', 1024],
  ['xl:', 1280],
];
const AFFICHAGES = new Set(['hidden', 'block', 'flex', 'inline-flex', 'grid']);

export function afficheA(element: Element, largeur: number): boolean {
  for (let courant: Element | null = element; courant; courant = courant.parentElement) {
    const classes = (courant.getAttribute('class') ?? '').split(/\s+/);
    let affiche = true;
    for (const [prefixe, seuil] of PALIERS) {
      if (largeur < seuil) continue;
      for (const classe of classes) {
        if (!classe.startsWith(prefixe)) continue;
        const reste = classe.slice(prefixe.length);
        if (reste.includes(':') || !AFFICHAGES.has(reste)) continue;
        affiche = reste !== 'hidden';
      }
    }
    if (!affiche) return false;
  }
  return true;
}
