/**
 * TCK-2050 (P174.01) — le profil actif, côté NAVIGATEUR, pour `X-Active-Profile-Hint`.
 *
 * L'API est sur une autre origine que le front : le cookie `active_profile_id`, `httpOnly` et posé
 * sur l'hôte du front par son relais, ne lui parvient jamais d'un appel du navigateur. Sans
 * l'indice, l'API n'auto-bascule que pour un compte d'une seule agence (`ResolveActiveProfile`) :
 * pour un compte de deux agences, chaque lecture du navigateur partait sans profil.
 *
 * La valeur vient du layout racine (`initialActiveProfileId`, lu du cookie comme `initialToken`) et
 * de `useSwitchActiveProfile`, toutes deux par `AuthProvider`, seul écrivain. `apiRequest` la lit
 * pour tout appel authentifié qui ne nomme aucun profil. Un indice périmé est sans danger : l'API
 * l'ignore s'il ne désigne plus un profil du compte.
 *
 * ⚠ Un état de module est partagé entre requêtes sur le serveur : il n'est écrit ni lu que dans le
 * navigateur. Côté serveur, `apiRequest` lit le cookie (TCK-1996).
 */
let profilActif: string | undefined;

export function poserProfilActifNavigateur(id: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  profilActif = id || undefined;
}

export function profilActifNavigateur(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return profilActif;
}
