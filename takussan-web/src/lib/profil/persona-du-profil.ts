import { resoudrePersona, typeDuProfilActif, type Persona } from '@/lib/navigation/personas';
import type { Profile } from '@/types/profile';
import type { User } from '@/types/user';

/**
 * TCK-2864 — la persona de la coque, jugée sur les faits du sommaire : le profil actif (celui de
 * `/api/me/profiles`, sinon celui que `/api/auth/me` a lié), jamais l'union des rôles ; l'hôte se
 * reconnaît à l'agence `individual` de ce profil. Les préférences de notification n'affichent que
 * les événements que cette persona reçoit.
 */
export function personaDuProfil({
  user,
  profils,
  profilActif,
}: {
  readonly user: Pick<User, 'roles'> & { readonly active_profile_id?: string | null };
  readonly profils: readonly Profile[] | null;
  readonly profilActif: string | null;
}): Persona {
  const actif = profilActif ?? user.active_profile_id ?? null;
  const profil = actif ? profils?.find((p) => p.id === actif) : undefined;
  return resoudrePersona({
    roles: user.roles,
    typeProfilActif: typeDuProfilActif(actif),
    agenceIndividuelle: profil?.agency?.kind === 'individual',
  });
}
