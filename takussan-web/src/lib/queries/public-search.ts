import { cache } from 'react';

import { apiFetch } from '@/lib/api';
import type { SearchResult } from '@/types/search';

/**
 * La recherche publique **exécutée par le serveur** — TCK-432.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * L'ARGUMENT EST UNE CHAÎNE, ET C'EST LA MÉMOÏSATION QUI L'EXIGE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `cache()` de React mémoïse par **identité** d'arguments. Deux `URLSearchParams` décrivant la même
 * requête sont deux objets distincts : passer l'objet ferait deux allers-retours là où la page en
 * veut un, et le second serait invisible — pas d'erreur, pas de test rouge, juste un appel de plus
 * par rendu. La clef passe donc en `string`, produite par `clefDeRecherche`, et deux appelants qui
 * décrivent la même requête partagent réellement la réponse.
 *
 * C'est ce qui rend gratuit le fait que `generateMetadata` et la page tirent toutes deux sur cette
 * fonction — même patron que `getProperty` (TCK-335).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Rend `null` sur TOUTE panne, y compris un 422 — et c'est délibéré.**
 *
 * On pourrait vouloir distinguer ici, comme `getProperty` distingue `introuvable` d'`indisponible`.
 * Ce serait un second chemin pour une décision qui est **déjà prise ailleurs, mieux** : sur un 422,
 * `PropertiesDiscoveryPage` nomme le filtre fautif (`errors.<champ>`) et propose de le retirer
 * plutôt que d'effacer la recherche (TCK-346), et sur un 5xx elle garde les résultats précédents
 * (TCK-335). Reconstruire cet arbitrage côté serveur produirait deux écrans d'erreur pour une même
 * panne, dont un moins bon.
 *
 * `null` signifie donc exactement **« le serveur n'a rien à semer »** : le client refait l'appel et
 * reprend, sans une ligne de code en moins, le comportement d'avant TCK-432. Le prix est un
 * aller-retour perdu sur un chemin d'erreur ; le gain est qu'aucune branche de traitement d'erreur
 * n'existe en double.
 *
 * ⚠️ **La locale est un ARGUMENT, pas une déduction** — `apiFetch` la devine sinon depuis
 * `document.cookie`, absent en RSC, et rend `undefined` **en silence** : `type_label` et
 * `contract_type_label` sortiraient dans la langue du serveur.
 *
 * ⚠️ **Aucun `fields[properties]`, et c'est mesuré** — `search()` n'est pas bâti sur
 * `spatie/laravel-query-builder` ; le paramètre est inerte au octet près. Le relevé est dans le
 * docblock de `lib/recherche-publique.ts`. La restriction de charge utile réelle, `per_page`, est
 * portée par `parametresDeRecherche`.
 */
export const rechercherBiensPublics = cache(
  async (requete: string, locale: string): Promise<SearchResult | null> => {
    try {
      return await apiFetch<SearchResult>(
        `/public/properties/search?${requete}`,
        undefined,
        { locale },
      );
    } catch (err: unknown) {
      // Au journal SERVEUR : utile au développeur, jamais au visiteur (principe non négociable n°5).
      console.error(`[liste publique] ?${requete} : `, err);
      return null;
    }
  },
);
