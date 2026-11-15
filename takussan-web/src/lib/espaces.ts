import { PROFILE_TYPES, type Profile } from '@/types/profile';

/**
 * TCK-497 — de quoi le sélecteur de profil doit-il proposer le choix.
 *
 * **Le défaut mesuré le 2026-08-30.** L'assistant hôte crée, dans une seule
 * transaction, une agence `individual`, un `AgencyAdminProfile` et un
 * `OwnerProfile` — les trois pour une seule personne. `GET /api/me/profiles`
 * rend donc deux profils, et le sélecteur en tirait deux lignes que rien ne
 * pouvait distinguer :
 *
 * ```
 * Administrateur   Espace de Mouhamadoul Amine THIAM
 *                  espace-de-mouhamadoul-amine-thiam-3
 * Propriétaire     Espace de Mouhamadoul Amine THIAM
 *                  espace-de-mouhamadoul-amine-thiam-3   ← identique
 * ```
 *
 * *Deux entrées indiscernables ne sont pas un choix, c'est un tirage.*
 *
 * **Ce qui est retenu : fusionner.** Pour une agence `individual`, l'espace est
 * unique — c'est la lecture la plus fidèle au mot « particulier ». Les deux
 * profils continuent d'exister en base et restent tous deux listés par l'API :
 * le changement est de PRÉSENTATION.
 *
 * ⚠ **Et fusionner ne retire aucun droit.** `MembershipCapabilityResolver` juge
 * une capacité pour un couple *(utilisateur, agence)* et fait un OR entre les
 * profils du user dans cette agence — son propre docblock le dit : « si
 * plusieurs profils dans la même agence accordent la capacité, l'autorisation
 * est OR ». Ce que le profil actif change, c'est le CONTEXTE d'agence, pas
 * l'étendue des capacités. Présenter un seul espace pour une agence n'en ferme
 * donc aucun écran.
 *
 * ⚠ Une agence `standard` n'est PAS concernée, et c'est délibéré : un
 * administrateur d'agence qui est aussi propriétaire d'un bien chez elle a deux
 * espaces qui ont un sens, et il doit pouvoir passer de l'un à l'autre.
 */

/** L'ordre de `PROFILE_TYPES`, qui met `agency_admin` en tête. */
const RANG = new Map(PROFILE_TYPES.map((t, i) => [t, i]));

/**
 * Les espaces à PROPOSER, à partir des profils que l'API liste.
 *
 * Pour une agence `individual` portant plusieurs profils, un seul est retenu :
 * celui qui est actif s'il l'est, sinon le premier dans l'ordre de
 * `PROFILE_TYPES` — c'est-à-dire `agency_admin`, celui que l'assistant hôte
 * épingle lui-même comme profil actif (TCK-271). Le représentant est donc
 * toujours celui sur lequel la personne se trouve déjà, et la fusion ne
 * provoque aucune bascule.
 *
 * Tout le reste passe sans être touché, dans l'ordre reçu.
 */
export function espacesAProposer(profiles: Profile[], activeId: string | null): Profile[] {
  const parAgenceIndividuelle = new Map<number, Profile[]>();

  for (const p of profiles) {
    if (p.agency?.kind !== 'individual' || p.agency_id === null) continue;
    const groupe = parAgenceIndividuelle.get(p.agency_id);
    if (groupe) groupe.push(p);
    else parAgenceIndividuelle.set(p.agency_id, [p]);
  }

  const representants = new Map<number, string>();
  for (const [agencyId, groupe] of parAgenceIndividuelle) {
    const actif = groupe.find((p) => p.id === activeId);
    const retenu =
      actif ??
      [...groupe].sort((a, b) => (RANG.get(a.type) ?? 99) - (RANG.get(b.type) ?? 99))[0];
    representants.set(agencyId, retenu.id);
  }

  return profiles.filter((p) => {
    if (p.agency?.kind !== 'individual' || p.agency_id === null) return true;
    return representants.get(p.agency_id) === p.id;
  });
}

/**
 * Le slug d'une agence, quand il IDENTIFIE quelque chose.
 *
 * Sur une agence professionnelle, c'est l'identifiant de son URL publique. Sous
 * le nom d'un particulier, il n'apporte rien — et il expose un rang de collision
 * (`…-3`) que `uniqueSlug()` incrémente sur collision GLOBALE : deux homonymes
 * se marchent dessus, et l'utilisateur lit un numéro qui ne signifie rien pour
 * personne, sur un espace qui est le sien.
 */
export function slugAAfficher(profile: Profile): string | null {
  if (profile.agency?.kind === 'individual') return null;
  return profile.agency?.slug ?? null;
}

/**
 * TCK-2621 — le témoin « Continuer en tant que client » : un cookie de SESSION (sans durée), écrit par
 * le navigateur, lu par le layout de `/app`. Sa valeur est l'identifiant du compte : un autre compte
 * ouvert dans le même navigateur se voit poser la question. Il ne survit pas à la fermeture du
 * navigateur — la question revient à la session suivante, comme le veut le ticket.
 */
export const COOKIE_CHOIX_CLIENT = 'espace_client';

/** Le nombre d'agences DISTINCTES des profils (l'API ne rend que les profils actifs). */
export function nombreDAgences(profiles: readonly Profile[]): number {
  return new Set(profiles.flatMap((p) => (p.agency_id === null ? [] : [p.agency_id]))).size;
}

/**
 * TCK-2621 — l'écran « Choisir un espace » se montre-t-il ? Seulement à un compte dont les profils
 * actifs couvrent au moins DEUX agences, et que l'API n'a lié à aucun (ni cookie, ni indice, ni dernier
 * espace retenu : avec une seule agence, l'API auto-bascule et `profilLie` n'est pas nul). Jamais
 * pendant une impersonation, ni après « Continuer en tant que client » dans la même session.
 */
export function doitChoisirUnEspace({
  profilLie,
  enImpersonation,
  choixClient,
  userId,
  profils,
}: {
  readonly profilLie: string | null | undefined;
  readonly enImpersonation: boolean;
  readonly choixClient: string | null | undefined;
  readonly userId: number;
  readonly profils: readonly Profile[];
}): boolean {
  if (profilLie) return false;
  if (enImpersonation) return false;
  if (choixClient === String(userId)) return false;
  return nombreDAgences(profils) >= 2;
}

/** Le sigle d'une agence : les initiales de ses deux premiers mots (« Thiès Properties » → « TP »). */
export function sigleDAgence(nom: string): string {
  const mots = nom.split(/[\s'’-]+/u).filter((m) => /\p{L}|\p{N}/u.test(m));
  const initiales = mots.slice(0, 2).map((m) => (m.match(/[\p{L}\p{N}]/u)?.[0] ?? ''));
  return initiales.join('').toLocaleUpperCase('fr') || '·';
}

/** « Agent · Dakar », ou « Agent » seul quand l'agence n'a pas de ville : jamais un séparateur pendant. */
export function sousLigneDEspace(role: string, ville: string | null | undefined): string {
  return [role, ville?.trim() || null].filter(Boolean).join(' · ');
}
