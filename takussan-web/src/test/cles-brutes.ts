import { expect } from 'vitest';

/**
 * Détecte une CHAÎNE NON TRADUITE rendue telle quelle à l'écran.
 *
 * Trois formes, et les trois ont réellement atteint l'écran de ce produit :
 *
 * | forme | d'où elle vient |
 * |---|---|
 * | `validation.<schéma>.<champ>` | un schéma zod dont le rendu ne résout pas la clé (TCK-292, lot J) |
 * | `errors.api.<code>` | un `ApiError` dont le libellé était calculé par un traducteur GLOBAL, absent des modules `'use server'` |
 * | `API error <n>` | le `message` natif d'`ApiError`, rendu tel quel par `{query.error.message}` |
 *
 * Les deux dernières sont la moitié que le premier correctif a déplacée sans supprimer : les
 * handlers BFF ont bien cessé d'émettre de l'anglais, mais le rendu s'est mis à afficher la clé.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE ASSERTION SUR TOUT LE DOM, ET PAS SEULEMENT SUR LE CHAMP TESTÉ
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * TCK-292 (lot J) a converti les schémas zod au patron « le schéma porte une clé, le rendu la
 * résout », et **18 messages sont partis en clé brute** parce que trois écrans rendaient le message
 * sans passer par le résolveur. Les tests existants de ces écrans étaient verts : ils vérifiaient
 * que la validation *bloquait*, jamais ce qu'elle *affichait*.
 *
 * Une assertion `getByText('Le libellé est requis.')` corrige le cas qu'on vient de trouver.
 * Celle-ci attrape **le cas qu'on n'a pas pensé à chercher** : elle balaie tout le texte rendu et
 * refuse la FORME `validation.<quelque.chose>`, quel que soit le champ, le schéma ou l'écran. Les
 * deux sont complémentaires — la première dit que le bon libellé est là, la seconde qu'aucune clé
 * ne traîne à côté.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * SON JUMEAU STATIQUE, ET LA MOITIÉ DU PROBLÈME QU'IL NE COUVRE PAS
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Celle-ci ne voit que ce qu'un test MONTE. Un écran sans test, ou un chemin de rendu qu'aucun test
 * ne parcourt, lui est invisible — et c'est exactement la situation qui a produit les 18 messages :
 * les écrans fautifs avaient des tests, verts, qui ne regardaient pas le texte affiché.
 *
 * Le recensement de `src/lib/schemas/__tests__/traducteurs-de-messages.test.ts` couvre l'autre
 * moitié : il parcourt `src/` sans rien monter et rougit sur tout fichier qui importe un schéma et
 * valide sans traduire. Réciproquement, lui ne peut pas savoir ce qui arrive à l'écran — il vérifie
 * qu'un traducteur est appelé, pas que le message rendu passe par lui. **Aucune des deux ne rend
 * l'autre superflue** ; un écran neuf qui rend un message de validation mérite les deux.
 */
const FORMES_INTERDITES: readonly RegExp[] = [
  /validation\.[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+/g,
  /errors\.api\.[A-Za-z][A-Za-z0-9]*/g,
  /\bAPI error \d{3}\b/g,
];

/**
 * Échoue si le conteneur rend une clé de validation non résolue.
 *
 * ```ts
 * await user.click(screen.getByRole('button', { name: 'Créer' }));
 * expect(await screen.findByText('Le libellé est requis.')).toBeInTheDocument();
 * attendAucuneCleBrute(document.body);
 * ```
 *
 * ⚠️ **`document.body`, pas le `container` du `render`** dès qu'un dialogue est en jeu : les
 * primitives `ui/` montent leur contenu dans un portail, hors de l'arbre rendu. Un balayage limité
 * au container passerait au vert en ne regardant pas l'endroit où le message s'affiche — le mode de
 * défaillance exact que cette fonction existe pour interdire.
 */
export function attendAucuneCleBrute(racine: HTMLElement = document.body): void {
  const texte = racine.textContent ?? '';
  const trouvees = [...new Set(FORMES_INTERDITES.flatMap((f) => [...texte.matchAll(f)].map((m) => m[0])))];
  expect(trouvees, `forme(s) non traduite(s) rendue(s) à l'écran : ${trouvees.join(', ')}`)
    .toEqual([]);
}

/**
 * Même contrôle, sur une CHAÎNE plutôt que sur un DOM.
 *
 * Les server actions de `src/app/actions/` ne rendent rien : elles **renvoient** un `message` que
 * le composant appelant affiche. C'est par là que la clé `errors.api.unauthenticated` atteignait
 * l'écran, et aucun balayage du DOM ne pouvait la voir — le défaut vivait un cran avant le rendu.
 */
export function attendTexteAffichable(valeur: unknown, contexte = 'message'): void {
  expect(valeur, `${contexte} : attendu une chaîne non vide`).toBeTypeOf('string');
  const texte = valeur as string;
  expect(texte.length, `${contexte} : chaîne vide`).toBeGreaterThan(0);
  const trouvees = [...new Set(FORMES_INTERDITES.flatMap((f) => [...texte.matchAll(f)].map((m) => m[0])))];
  expect(trouvees, `${contexte} : forme(s) non traduite(s) — ${trouvees.join(', ')} (dans « ${texte} »)`)
    .toEqual([]);
}
