import type { QueryClient } from '@tanstack/react-query';

/** La clé des profils de l'utilisateur, que le changement d'espace épargne (le menu garde sa coche). */
export const CLE_PROFILS = ['me', 'profiles'] as const;

function estClePrefixee(cle: readonly unknown[], prefixe: readonly unknown[]): boolean {
  return prefixe.every((segment, i) => cle[i] === segment);
}

/**
 * TCK-2091 (P197.05), puis TCK-2229 (P197.06) — oublie et relit tout le cache hors les profils,
 * quand l'espace (profil actif) change. Depuis TCK-2050, toute lecture du navigateur porte le
 * profil actif ; une clé qui ne le porte pas (la plupart) garderait l'agence quittée jusqu'à son
 * `staleTime`. `reset` et non `invalidate`, pour ne jamais montrer l'ancien espace pendant la
 * relecture. Une liste de préfixes « portés par l'agence » serait l'oubli que ce point corrige.
 *
 * Deux appelants, et eux seuls : l'`onSuccess` de `useSwitchActiveProfile` (changement par le
 * menu, confirmé par le serveur) et `AuthProvider`, quand la mise en page rend un profil que le
 * client ne tient pas encore (parcours d'accueil qui pose le cookie par une action serveur).
 */
export function oublierLeCacheDEspace(queryClient: QueryClient): Promise<void> {
  return queryClient.resetQueries({
    predicate: (query) => !estClePrefixee(query.queryKey, CLE_PROFILS),
  });
}
