'use client';

/**
 * TCK-279 — « l'utilisateur courant peut-il FAIRE ceci ? », par capacité.
 *
 * ## Ce que ce hook remplace
 *
 * Les gardes `isAdmin(user.roles)` / `isAgencyAdmin(user.roles)` qui pilotent
 * une fonctionnalité GRANULAIRE. Elles raisonnent sur un TYPE de profil, alors
 * que depuis TCK-279 deux `agency_admin` de la même agence peuvent porter des
 * rôles différents : le type ne dit plus ce qu'on a le droit de faire.
 *
 * Les gardes de NAVIGATION (« cet écran est-il pour les admins ? ») gardent
 * `isAdmin` : elles portent sur l'appartenance, pas sur un verbe.
 *
 * ## ⚠️ Ce hook n'autorise rien
 *
 * Il sert à ne pas PROPOSER un geste qui rendrait 403. La décision reste
 * entière côté serveur, dans les policies. Cacher un bouton n'est pas une
 * sécurité — c'est une politesse. Ne jamais s'en servir pour ouvrir un accès,
 * ni le lire comme une preuve : un front peut mentir, un serveur non.
 *
 * ## `isLoading` n'est pas cosmétique
 *
 * Tant que le catalogue n'est pas arrivé, `can` vaut `false`. Rendre un bouton
 * sur cette seule base le ferait DISPARAÎTRE puis réapparaître — pire qu'un
 * bouton désactivé. Les appelants doivent traiter `isLoading` explicitement.
 */

import { useMemo } from 'react';

import { useApiQuery } from '@/hooks/useApiQuery';
import type { ApiResponse } from '@/types/api';
import type { CapabilityValue } from '@/types/agency-role';

interface MeCapabilities {
  readonly agency_id: number | null;
  readonly capabilities: readonly CapabilityValue[];
}

export const meCapabilityKeys = {
  all: ['me', 'capabilities'] as const,
  forAgency: (agencyId?: number) => ['me', 'capabilities', agencyId ?? 'active'] as const,
};

/**
 * Les capacités de l'utilisateur courant dans l'agence donnée — ou dans celle
 * de son profil actif quand `agencyId` est omis.
 *
 * `staleTime` de 5 minutes : les capacités ne changent qu'à une réaffectation
 * de rôle ou à une édition de rôle, et les mutations correspondantes
 * invalident `['me','capabilities']` (cf. `agency-roles.ts`).
 */
export function useMyCapabilities(agencyId?: number, enabled = true) {
  return useApiQuery<ApiResponse<MeCapabilities>>(
    meCapabilityKeys.forAgency(agencyId),
    '/api/me/capabilities',
    {
      // `enabled: false` n'est pas une optimisation de confort : sur un écran
      // partagé entre un client et le personnel de l'agence, le client n'a
      // aucune capacité à consulter, et le hook s'appelant inconditionnellement
      // (règle des hooks) tirerait une requête par page pour une réponse vide.
      enabled,
      // `agency_id` n'est pas un paramètre spatie : il passe par `extra`,
      // l'échappatoire prévue par `buildQueryString`. Le poser à la racine de
      // `params` serait silencieusement ignoré par le sérialiseur.
      params: agencyId ? { extra: { agency_id: agencyId } } : undefined,
      staleTime: 5 * 60 * 1000,
    },
  );
}

export interface UseCanResult {
  /** `false` tant que la réponse n'est pas arrivée — lire `isLoading` avec. */
  readonly can: boolean;
  readonly isLoading: boolean;
}

/**
 * @example
 * const { can, isLoading } = useCan('properties.publish');
 * if (isLoading) return <ButtonSkeleton />;
 * return can ? <PublishButton /> : null;
 */
export function useCan(
  capability: CapabilityValue,
  agencyId?: number,
  enabled = true,
): UseCanResult {
  const { data, isLoading } = useMyCapabilities(agencyId, enabled);

  const can = useMemo(
    () => data?.data.capabilities.includes(capability) ?? false,
    [data, capability],
  );

  return { can, isLoading };
}

/**
 * Variante pour plusieurs capacités d'un coup — un seul appel réseau au lieu
 * de N hooks. `mode: 'all'` exige toutes les capacités, `'any'` une seule.
 */
export function useCanAll(
  capabilities: readonly CapabilityValue[],
  options: {
    readonly mode?: 'all' | 'any';
    readonly agencyId?: number;
    /**
     * `false` coupe la requête. `can` vaut alors `false` et `isLoading`
     * aussi : l'appelant a déjà décidé que la question ne se pose pas.
     */
    readonly enabled?: boolean;
  } = {},
): UseCanResult {
  const { mode = 'all', agencyId, enabled = true } = options;
  const { data, isLoading } = useMyCapabilities(agencyId, enabled);

  const can = useMemo(() => {
    const granted = data?.data.capabilities;
    if (!granted) return false;
    if (capabilities.length === 0) return true;
    return mode === 'all'
      ? capabilities.every((c) => granted.includes(c))
      : capabilities.some((c) => granted.includes(c));
  }, [data, capabilities, mode]);

  return { can, isLoading };
}
