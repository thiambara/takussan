/**
 * TCK-2621 — le persona de la coque suit le profil que l'API a LIÉ quand le cookie manque.
 */
import { describe, expect, it } from 'vitest';
import { profilLieDeLaCoque, resoudrePersona, typeDuProfilActif } from '@/lib/navigation/personas';
import type { UserRole } from '@/types/user';

const persona = (cookie: string | undefined, lie: string | null, roles: UserRole[]) =>
  resoudrePersona({ roles, typeProfilActif: typeDuProfilActif(profilLieDeLaCoque(cookie, { active_profile_id: lie })) });

describe('profilLieDeLaCoque', () => {
  it('le cookie, s’il est lisible, décide', () => {
    expect(profilLieDeLaCoque('agent:5', { active_profile_id: 'owner:9' })).toBe('agent:5');
  });

  it('sans cookie, le profil lié par l’API (dernier espace retenu)', () => {
    expect(profilLieDeLaCoque(undefined, { active_profile_id: 'owner:9' })).toBe('owner:9');
    expect(profilLieDeLaCoque('', { active_profile_id: 'owner:9' })).toBe('owner:9');
  });

  it('ni l’un ni l’autre : rien (l’ordre figé de `resoudrePersona` reprend)', () => {
    expect(profilLieDeLaCoque(undefined, { active_profile_id: null })).toBeNull();
    expect(profilLieDeLaCoque(undefined, {})).toBeNull();
  });

  it('un admin d’agence, aussi bailleur, retrouvé dans son espace d’admin a le menu de l’admin, pas celui du bailleur', () => {
    const roles: UserRole[] = ['customer', 'agency_admin', 'owner'];
    expect(persona(undefined, 'agency_admin:3', roles)).toBe('admin-agence');
    // Ce que donnait l'ordre figé (`TYPE_DOMINANT`, bailleur d'abord) sans le relais :
    expect(persona(undefined, null, roles)).toBe('bailleur');
  });

  it('le compte de deux agences retrouvé dans son espace de bailleur a le menu du bailleur', () => {
    expect(persona(undefined, 'owner:9', ['customer', 'owner'])).toBe('bailleur');
  });
});
