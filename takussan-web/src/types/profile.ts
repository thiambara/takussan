/**
 * Les types de profil du FIL, dans l'ordre de `ActiveProfileResolver::TYPE_MAP`
 * (`takussan-api/app/Services/Profiles/ActiveProfileResolver.php`).
 *
 * ⚠ C'est une liste ÉCRITE À LA MAIN qui prétend décrire un format de fil, et elle
 * avait cessé de le faire : `agency_admin` y manquait, alors que le back l'émet
 * depuis TCK-271. `Record<ProfileType, …>` restait pourtant exhaustif aux yeux de
 * `tsc` — le compilateur validait fidèlement une carte qui ne correspondait plus au
 * terrain, et la barre supérieure affichait « undefined · <agence> » (TCK-329).
 *
 * Deux choses la tiennent désormais :
 *   1. `src/types/__tests__/profile-types.parity.test.ts` confronte cette liste aux
 *      clés réelles de `TYPE_MAP` — la dérive rougit au moment où elle est introduite.
 *   2. Les tables indexées par `ProfileType` sont des `Record<ProfileType, …>`
 *      COMPLETS : ajouter une entrée ici casse la compilation tant qu'elles ne
 *      suivent pas.
 *
 * Le tout est doublé d'un repli explicite dans `profileTypeLabel` : une valeur de fil
 * qu'aucune des deux gardes n'a attrapée reste LISIBLE (le jeton brut) au lieu de
 * devenir `undefined`.
 */
export const PROFILE_TYPES = [
  'agency_admin',
  'owner',
  'agent',
  'broker',
  'service_provider',
] as const;

export type ProfileType = (typeof PROFILE_TYPES)[number];

export type ProfileAgencySummary = {
  id: number;
  name: string;
  slug: string;
};

export type Profile = {
  id: string;
  type: ProfileType;
  numeric_id: number;
  agency_id: number | null;
  agency?: ProfileAgencySummary;
  status: string | null;
  created_at: string | null;
};

export type MyProfilesResponse = {
  data: Profile[];
  meta: {
    active_profile_id: string | null;
    count: number;
  };
};
