import { ApiError, apiRequest } from './api';
import { codeDoubleFacteur, type CodeDoubleFacteur } from './double-facteur';

/**
 * TCK-600 (ADR-0047) — les gestes de la console plateforme, recopie des VALEURS de
 * `App\Models\Enums\PlatformAbility` (parité gardée par `platform-abilities.parity.test.ts`).
 *
 * Seules les valeurs sont recopiées, JAMAIS la matrice niveau → gestes : le front lit les gestes
 * de l'opérateur courant dans `GET /api/admin/me/abilities`, et filtre avec.
 */
export const PLATFORM_ABILITIES = [
  'platform.console.access',
  'platform.reports.view',
  'platform.health.view',
  'platform.agencies.view',
  'platform.users.view',
  'platform.users.support',
  'platform.users.block',
  'platform.moderation.view',
  'platform.search.global',
  'platform.users.impersonate',
  'platform.users.erase',
  'platform.operators.manage',
  'platform.agencies.suspend',
  'platform.kyc.view',
  'platform.settings.manage',
] as const;

export type PlatformAbility = (typeof PLATFORM_ABILITIES)[number];

export type PlatformLevel = 'super_admin' | 'support' | 'viewer';

export type PlatformAbilities = {
  level: PlatformLevel | null;
  abilities: PlatformAbility[];
};

/** TCK-1203 — l'entrée de la console refusée faute de second facteur, sur le compte ou sur ce jeton. */
export type RefusDoubleFacteur = { readonly doubleFacteur: CodeDoubleFacteur };

/**
 * Les gestes de l'opérateur, lus avec SON jeton (jamais celui d'une session d'impersonation).
 * Rend `null` quand l'API refuse (403 : pas d'opérateur actif) ; toute autre erreur remonte.
 *
 * TCK-1203 — un 403 de second facteur n'est PAS « pas d'opérateur » : `EnsureSuperAdmin` l'oppose
 * à tout niveau (`viewer` et `support` compris) sans 2FA, et à un jeton qui ne l'a pas vue. Confondu
 * avec `null`, il renvoyait l'opérateur vers `/app` sans jamais lui demander son code.
 */
export async function fetchPlatformAbilities(
  token: string,
): Promise<PlatformAbilities | RefusDoubleFacteur | null> {
  try {
    const res = await apiRequest<{ data: PlatformAbilities }>('/api/admin/me/abilities', { token });
    return res.data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      const code = codeDoubleFacteur(err);
      return code ? { doubleFacteur: code } : null;
    }
    throw err;
  }
}
