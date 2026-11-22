import { cache } from 'react';

import { getMeAction } from '@/app/actions/auth';
import { getMyProfilesAction } from '@/app/actions/profiles';
import { apiRequest } from '@/lib/api';
import { typeDuProfilActif } from '@/lib/navigation/personas';
import type { MesPiecesResponse, PieceDuProfil } from '@/lib/pieces/pieces';
import { isOwner, isServiceProvider } from '@/lib/roles';
import { getToken } from '@/lib/session';
import type { ApiResponse } from '@/types/api';
import type { PayoutMethod } from '@/types/invoice';
import type { User } from '@/types/user';
import type { Profile } from '@/types/profile';

/**
 * TCK-2635 — les faits du sommaire du profil, lus UNE fois par requête (le cadre et la page les lisent
 * tous deux) : le compte (`/api/auth/me`, déjà mémoïsé) et ses profils (`/api/me/profiles`). Des
 * profils illisibles rendent `null` : le sommaire n'en déduit alors rien, il ne suppose pas.
 *
 * TCK-2864 — et, pour le bailleur, ce qui l'empêche d'être payé :
 *  · ses pièces (`GET /api/me/pieces`), lues seulement quand le PROFIL ACTIF est le bailleur — l'encart
 *    mène à « Vos pièces » (`/app/pieces`), qui lit les pièces de ce même profil actif ;
 *  · ses moyens de versement (`GET /api/me/payout-methods`), pour qui a la rangée (bailleur, prestataire).
 * Non lus : `undefined` ; illisibles : `null`. Dans les deux cas, rien n'en est déduit.
 */
export const faitsDuSommaire = cache(
  async (): Promise<{
    user: User;
    profils: readonly Profile[] | null;
    profilActif: string | null;
    pieces?: readonly PieceDuProfil[] | null;
    versements?: readonly PayoutMethod[] | null;
  }> => {
    const [user, profils] = await Promise.all([getMeAction(), getMyProfilesAction()]);
    const profilActif = profils.ok ? profils.data.meta.active_profile_id : null;
    const token = await getToken();
    const bailleurActif = typeDuProfilActif(profilActif ?? user.active_profile_id ?? null) === 'owner';
    const [pieces, versements] = await Promise.all([
      token && bailleurActif
        ? apiRequest<MesPiecesResponse>('/api/me/pieces', { token }).then((r) => r.data, () => null)
        : undefined,
      token && (isOwner(user.roles) || isServiceProvider(user.roles))
        ? apiRequest<ApiResponse<PayoutMethod[]>>('/api/me/payout-methods', { token }).then((r) => r.data, () => null)
        : undefined,
    ]);
    return {
      user,
      profils: profils.ok ? profils.data.data : null,
      // TCK-2635 — « Espace en cours » de « Mes espaces », à la vue d'ensemble.
      profilActif,
      ...(pieces !== undefined ? { pieces } : {}),
      ...(versements !== undefined ? { versements } : {}),
    };
  },
);
