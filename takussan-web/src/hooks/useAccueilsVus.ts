'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/context/AuthContext';
import type { WelcomeSeenListResponse } from '@/types/welcome-view';

/**
 * TCK-1766 (P136.03) — les clés d'accueil déjà vues du compte, lues UNE fois et partagées.
 *
 * Quatre lecteurs (`useWelcomeOnce`, `useTenantWelcomeOnce`, `useAgencyStandardWelcomeOnce`,
 * `MinimalProfileTriggerProvider`) appelaient chacun `GET /api/me/welcome-seen` dans leur effet :
 * trois lectures identiques à chaque chargement de `/app` pour un client seul. Ils lisent
 * désormais la même entrée de cache, par le même relais BFF.
 *
 * - La clé porte l'identifiant du compte : un autre compte ne lit jamais la liste du précédent.
 * - Une lecture en échec n'est pas relancée (`retry: false`) : chaque lecteur garde sa règle
 *   d'échec d'avant (ne rien ouvrir).
 * - `marquerVu` écrit la clé (POST idempotent, silencieux) et l'ajoute à l'entrée du cache, pour
 *   qu'un lecteur monté plus tard ne rouvre pas une fenêtre fermée.
 */
export const accueilsVusQueryKeys = {
  compte: (userId: number | null) => ['me', 'welcome-seen', userId] as const,
};

async function lireAccueilsVus(): Promise<string[]> {
  const res = await fetch('/api/me/welcome-seen', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error(`welcome-seen ${res.status}`);
  const body = (await res.json()) as WelcomeSeenListResponse;
  return Array.isArray(body?.data) ? body.data : [];
}

export type AccueilsVus = {
  /** `null` tant que la lecture n'a pas rendu, ou si elle a échoué. */
  vus: readonly string[] | null;
  /** La lecture a échoué. */
  echec: boolean;
  marquerVu: (cle: string) => void;
};

export function useAccueilsVus(actif: boolean): AccueilsVus {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: accueilsVusQueryKeys.compte(userId),
    queryFn: lireAccueilsVus,
    enabled: actif && userId !== null,
    retry: false,
    // Une lecture par chargement : un lecteur monté plus tard (le parcours locataire, après le
    // parcours client) lit l'entrée sans la redemander. `marquerVu` la tient à jour, et
    // `openSession` / `logout` vident le cache.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const marquerVu = (cle: string) => {
    queryClient.setQueryData<string[]>(accueilsVusQueryKeys.compte(userId), (vus) =>
      vus && !vus.includes(cle) ? [...vus, cle] : vus,
    );
    void fetch('/api/me/welcome-seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ key: cle }),
    }).catch(() => {
      // Silencieux : le serveur est idempotent ; une écriture perdue rouvre la fenêtre à la
      // session suivante, ce qui vaut mieux qu'une coque en erreur.
    });
  };

  return { vus: query.data ?? null, echec: query.isError, marquerVu };
}
