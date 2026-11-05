'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useApiQuery } from '@/hooks/useApiQuery';
import type { EtapeDeDemarrage } from '@/lib/navigation/demarrer';

/** TCK-2479 — `GET /api/me/espace/demarrage` (`EspaceDemarrageController`). */
export interface DemarrageDeLEspaceResponse {
  readonly data: { readonly etapes: readonly EtapeDeDemarrage[] };
}

/**
 * Sans le profil : changer de profil oublie tout le cache de l'espace (`oublierLeCacheDEspace`,
 * `src/lib/cache-d-espace.ts`), cette clé comprise.
 */
export const CLE_DEMARRAGE = ['me', 'espace', 'demarrage'] as const;

const FRAICHEUR_MS = 30_000;

/**
 * Les étapes du groupe « Démarrer ». Aucun sondage : la lecture se refait à la NAVIGATION quand elle a
 * plus de 30 s — une étape faite sur sa page (publier, inviter) disparaît au retour dans le menu, que
 * la barre, montée par le layout, ne remonte pas.
 *
 * ⚠ Le préfixe `/api` est écrit ici : `useApiQuery` ne l'ajoute pas (CLAUDE.md racine).
 */
export function useDemarrageDeLEspace({ enabled }: { readonly enabled: boolean }) {
  const { token } = useAuth();
  const pathname = usePathname();
  const client = useQueryClient();
  const actif = enabled && Boolean(token);
  const requete = useApiQuery<DemarrageDeLEspaceResponse>([...CLE_DEMARRAGE], '/api/me/espace/demarrage', {
    enabled: actif,
    staleTime: FRAICHEUR_MS,
    retry: false,
  });
  // `cancelRefetch: false` : la barre de bureau et le tiroir montent chacun ce hook, et chacun relit à
  // la même navigation — par défaut, le second ANNULAIT la lecture du premier et la relançait (mesuré
  // dans `demarrage-espace.test.tsx` : trois requêtes au lieu de deux). Une lecture en cours sert aux deux.
  useEffect(() => {
    if (actif) {
      void client.refetchQueries(
        { queryKey: [...CLE_DEMARRAGE], type: 'active', stale: true },
        { cancelRefetch: false },
      );
    }
  }, [pathname, actif, client]);
  return requete;
}
