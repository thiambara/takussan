import { cache } from 'react';

import { getMeAction } from '@/app/actions/auth';
import { getMyProfilesAction } from '@/app/actions/profiles';
import type { User } from '@/types/user';
import type { Profile } from '@/types/profile';

/**
 * TCK-2635 — les faits du sommaire du profil, lus UNE fois par requête (le cadre et la page les lisent
 * tous deux) : le compte (`/api/auth/me`, déjà mémoïsé) et ses profils (`/api/me/profiles`). Des
 * profils illisibles rendent `null` : le sommaire n'en déduit alors rien, il ne suppose pas.
 */
export const faitsDuSommaire = cache(
  async (): Promise<{ user: User; profils: readonly Profile[] | null; profilActif: string | null }> => {
    const [user, profils] = await Promise.all([getMeAction(), getMyProfilesAction()]);
    return {
      user,
      profils: profils.ok ? profils.data.data : null,
      // TCK-2635 — « Espace en cours » de « Mes espaces », à la vue d'ensemble.
      profilActif: profils.ok ? profils.data.meta.active_profile_id : null,
    };
  },
);
