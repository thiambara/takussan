import { isSuperAdmin } from '@/lib/roles';
import { fetchPlatformAbilities, type PlatformAbilities, type RefusDoubleFacteur } from '@/lib/platform-abilities';
import type { User } from '@/types/user';

/**
 * TCK-610 (AC6) — l'entrée de la console dans `/app` suit le geste `platform.console.access`, pas le
 * rôle : un opérateur `viewer` ou `support` n'a pas `super_admin` dans `roles`, et n'entrait dans la
 * console qu'en tapant son adresse.
 *
 * Le refus « second facteur requis » COMPTE comme une entrée : `EnsureSuperAdmin` ne l'oppose qu'à un
 * compte qui détient un profil plateforme actif (le test du profil le précède), et c'est la console
 * qui conduit à l'enrôlement (`EntreeConsoleDoubleFacteur`, TCK-1203). Le cacher reproduirait le trou
 * pour l'opérateur sans 2FA. (Un compte que le support a réinitialisé, `force_2fa_reconfigure`, reçoit
 * le même code de tout `/api` — mais `(dashboard)` l'envoie à l'enrôlement avant cette coque.)
 */
export function consoleOuverte(lecture: PlatformAbilities | RefusDoubleFacteur | null): boolean {
  if (lecture === null) return false;
  if ('doubleFacteur' in lecture) return true;
  return lecture.abilities.includes('platform.console.access');
}

/**
 * La lecture, avec le jeton de la COQUE (`getToken`) : l'entrée dit ce que peut le compte affiché.
 * Sans jeton (le layout n'en passe pas sous impersonation, l'API y refuse `/api/admin/*`), seul le
 * rôle juge. Le `super_admin` n'en paie aucune ; toute autre panne de l'API ferme l'entrée au lieu de
 * faire tomber `/app` pour tous les comptes.
 */
export async function accesALaConsole(user: Pick<User, 'roles'>, token: string | undefined): Promise<boolean> {
  if (isSuperAdmin(user.roles)) return true;
  if (!token) return false;
  try {
    return consoleOuverte(await fetchPlatformAbilities(token));
  } catch {
    return false;
  }
}
