'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';
import { CLE_PROFILS } from '@/lib/cache-d-espace';
import { espacesAProposer } from '@/lib/espaces';
import { casesDuPersona } from '@/lib/navigation/barre-publique';
import { typeDuProfilActif } from '@/lib/navigation/personas';
import { useMenuDeLEspace, type EntreeRendue, type MenuDeLEspace } from '@/components/layout/useMenuDeLEspace';
import { PROFILE_TYPES, type MyProfilesResponse } from '@/types/profile';
import type { User } from '@/types/user';

/**
 * La lecture des espaces du compte, sous la clé de `useMyProfiles` (`CLE_PROFILS`) : même cache, même
 * relais `/api/me/profiles`. Recopiée ici et non importée : `@/hooks/useProfiles` porte aussi la
 * bascule d'espace, qui lit l'espace de noms `profile` (13 ko) — l'importer depuis la coque publique
 * l'ajouterait au dictionnaire de TOUTES les pages publiques (`check-i18n-namespaces.mjs` suit les
 * imports). La bascule ne vit que sur l'écran « Moi », qui monte sa propre frontière.
 */
async function lireLesEspaces(): Promise<MyProfilesResponse> {
  const res = await fetch('/api/me/profiles', { credentials: 'include' });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data);
  }
  return res.json();
}

export function useEspacesDuComptePublic(user: User | null) {
  const porteUnProfil = user !== null && PROFILE_TYPES.some((t) => user.roles.includes(t));
  return useQuery<MyProfilesResponse, ApiError>({
    queryKey: CLE_PROFILS,
    queryFn: lireLesEspaces,
    enabled: porteUnProfil,
    staleTime: 30_000,
  });
}

export interface EspacePublic extends MenuDeLEspace {
  /** Les cases 2 et 3 de la barre d'onglets publique (ADR-0091 §2). */
  readonly cases: readonly EntreeRendue[];
  /** Le compte tient plusieurs espaces : « Moi » et « Mon espace » proposent d'en changer. */
  readonly plusieursEspaces: boolean;
  /** `agency.kind === 'standard'` du profil actif, pour l'admin seulement (comme le layout de `/app`). */
  readonly agencyIsStandard: boolean | undefined;
  /** Le nom de l'agence du profil actif, quand il y en a une. */
  readonly nomDeLEspace: string | null;
}

/**
 * TCK-2493 / TCK-2494 (ADR-0091) — l'espace du compte connecté, vu du site public : le persona du
 * profil actif et son menu composé, par LA MÊME fonction que la coque de `/app` (`useMenuDeLEspace`).
 *
 * Ce que le site public sait de moins que le layout de `/app`, et ce qu'il en fait :
 * - le profil actif vient de `AuthContext` (`activeProfileId`, posé par la racine, puis par la
 *   bascule d'espace) : changer d'espace change la barre sans recharger ;
 * - la nature de l'agence (`standard` / `individual`) vient de `/api/me/profiles`, et seulement pour
 *   l'admin — c'est ce que le layout de `/app` lit, et c'est ce qui sépare l'hôte de l'admin ;
 * - les modules masqués et la suspension de l'agence ne sont PAS lus (aucune requête de plus sur
 *   chaque page publique) : une entrée masquée peut paraître ici, sa page reste servie.
 */
export function useEspacePublic(user: User): EspacePublic {
  const { activeProfileId } = useAuth();
  const { data: espaces } = useEspacesDuComptePublic(user);
  const idActif = activeProfileId ?? espaces?.meta.active_profile_id ?? null;
  const actif = espaces?.data.find((p) => p.id === idActif) ?? null;
  const kind = actif?.agency?.kind;
  const agencyIsStandard = user.roles.includes('agency_admin')
    ? kind === 'standard'
      ? true
      : kind === 'individual'
        ? false
        : undefined
    : undefined;
  const menu = useMenuDeLEspace({
    user,
    agencyIsStandard,
    typeProfilActif: typeDuProfilActif(activeProfileId),
    agencySuspended: false,
    modulesMasques: [],
  });
  return {
    ...menu,
    cases: casesDuPersona(menu.groupesDeLaDisposition, menu.persona),
    // TCK-497 — l'agence `individual` porte deux profils pour un seul espace : on compte ce que le
    // sélecteur PROPOSE, pas ce que l'API liste.
    plusieursEspaces: espacesAProposer(espaces?.data ?? [], idActif).length > 1,
    agencyIsStandard,
    nomDeLEspace: actif?.agency?.name ?? null,
  };
}
