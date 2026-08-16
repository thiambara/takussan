import { describe, expect, it } from 'vitest';
import { ROLE_CHOICES } from '../UserRolesEditor';

/**
 * TCK-278 — garde de non-régression.
 *
 * `PUT /api/users/{user}/role` accepte encore `tenant`, `customer` et
 * `service_provider` en validation, puis les traite en **no-op silencieux** :
 * `UserRoleController::mutateProfileForRole()` retombe sur `default => null`
 * pour ces trois valeurs. L'API répond 200, l'UI affiche « Mettre à jour »
 * réussi, et **rien n'a changé en base**.
 *
 * Le ticket avait tranché : ces rôles passent par leurs flux dédiés
 * (invitation / booking / lease), pas par ce sélecteur. Seuls les trois rôles
 * qui matérialisent réellement un profil agence-scopé restent proposés.
 */
describe('ROLE_CHOICES', () => {
  it('ne propose que les rôles qui matérialisent un profil', () => {
    expect(ROLE_CHOICES.map((choice) => choice.value)).toEqual([
      'agency_admin',
      'agent',
      'owner',
    ]);
  });

  it.each(['tenant', 'customer', 'service_provider'])(
    'ne propose plus %s (no-op silencieux côté backend)',
    (role) => {
      expect(ROLE_CHOICES.map((choice) => choice.value)).not.toContain(role);
    },
  );
});
