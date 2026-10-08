import { ApiError, apiRequest } from './api';

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

/**
 * Les gestes de l'opérateur, lus avec SON jeton (jamais celui d'une session d'impersonation).
 * Rend `null` quand l'API refuse (403 : pas d'opérateur actif) ; toute autre erreur remonte.
 */
export async function fetchPlatformAbilities(token: string): Promise<PlatformAbilities | null> {
  try {
    const res = await apiRequest<{ data: PlatformAbilities }>('/api/admin/me/abilities', { token });
    return res.data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return null;
    throw err;
  }
}
