import { doitChoisirUnEspace, espacesAProposer } from '@/lib/espaces';
import { fetchMyProfiles } from '@/lib/profiles';
import { estEnImpersonation, getChoixClient, getToken } from '@/lib/session';
import type { Profile } from '@/types/profile';
import type { User } from '@/types/user';

/**
 * TCK-2621 — les espaces à proposer à l'écran « Choisir un espace », ou `null` quand l'écran ne se montre
 * pas (`doitChoisirUnEspace`). La liste des profils n'est lue que pour un compte que l'API n'a lié à
 * AUCUN profil (`user.active_profile_id` nul), hors impersonation et hors « Continuer en tant que
 * client » : un compte lié — le cas de tout membre d'une seule agence — ne paie aucune requête de plus.
 *
 * Une lecture en échec rend `null` : la coque s'affiche comme avant, jamais une page d'erreur.
 */
export async function espacesAChoisir(user: User): Promise<Profile[] | null> {
  if (user.active_profile_id) return null;
  const [enImpersonation, choixClient] = await Promise.all([estEnImpersonation(), getChoixClient()]);
  if (enImpersonation || choixClient === String(user.id)) return null;
  const token = await getToken();
  if (!token) return null;
  const profils = await fetchMyProfiles(token).catch(() => null);
  if (!profils) return null;
  const montrer = doitChoisirUnEspace({
    profilLie: user.active_profile_id,
    enImpersonation,
    choixClient,
    userId: user.id,
    profils: profils.data,
  });
  return montrer ? espacesAProposer(profils.data, null) : null;
}
