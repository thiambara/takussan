/**
 * La règle `heading-order` d'axe, et elle seule, sur un rendu jsdom — TCK-946 (P31.05).
 *
 * ## Pourquoi axe, et pas une garde maison
 *
 * Le défaut a été MESURÉ par axe au navigateur (`heading-order` sur `#pied-discover`, sur la
 * première carte de la recherche et de `/fr/agencies`) : la garde rejoue la même règle, pas une
 * réécriture de ce qu'on croit qu'elle dit. `axe-core` est une dépendance de dev DÉCLARÉE depuis ce
 * ticket — jusque-là il n'arrivait que par `eslint-plugin-jsx-a11y`, transitif.
 *
 * ## Ce que la mesure sous jsdom ne voit pas
 *
 * jsdom ne charge aucune feuille : un titre `sr-only` y est visible, comme il l'est pour un lecteur
 * d'écran — c'est le bon regard pour cette règle. Mais un titre que seul un `display: none` de
 * Tailwind retire de l'arbre (`max-lg:hidden`) y compterait encore : la règle juge l'ordre du DOM,
 * pas celui d'une largeur d'écran.
 */
import axe from 'axe-core';

/** Un titre que la règle refuse : son niveau, son texte, et le chemin qu'axe lui donne. */
export interface TitreHorsOrdre {
  readonly cible: string;
  readonly html: string;
}

/**
 * Les titres qui sautent un niveau dans `racine` — tableau vide quand l'ordre tient.
 *
 * Rendre la liste plutôt qu'un booléen : un rouge qui nomme `<h4 id="pied-discover">` dit où
 * chercher, un `expected false to be true` ne dit rien.
 */
export async function titresHorsOrdre(racine: Element = document.body): Promise<TitreHorsOrdre[]> {
  const resultat = await axe.run(racine, {
    runOnly: { type: 'rule', values: ['heading-order'] },
    resultTypes: ['violations'],
  });
  return resultat.violations.flatMap((violation) =>
    violation.nodes.map((noeud) => ({ cible: noeud.target.join(' '), html: noeud.html })),
  );
}
