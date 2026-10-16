/**
 * TCK-645 — « Nouveau groupe » n'est proposé que hors d'une agence `individual`.
 *
 * La règle se juge sur l'agence du PROFIL ACTIF, telle que `GET /api/me/profiles` la rend. Quatre
 * réponses possibles, et c'est la quatrième — « on ne sait pas » — qui porte la décision :
 * fail-closed, le bouton n'est pas proposé tant que le `kind` n'est pas lu.
 */
import { describe, expect, it } from 'vitest';
import type { MyProfilesResponse, Profile } from '@/types/profile';
import { natureDeLEspaceActif, peutProposerUnGroupe } from '../espaceActif';

function profil(id: string, kind: 'standard' | 'individual' | null | undefined, agencyId: number | null = 7): Profile {
  return {
    id,
    type: 'agency_admin',
    numeric_id: 1,
    agency_id: agencyId,
    agency:
      agencyId === null
        ? undefined
        : { id: agencyId, name: 'Agence', slug: 'agence', ...(kind === undefined ? {} : { kind }) },
    status: 'active',
    created_at: null,
  };
}

function reponse(profiles: Profile[], actif: string | null): MyProfilesResponse {
  return { data: profiles, meta: { active_profile_id: actif, count: profiles.length } };
}

describe('natureDeLEspaceActif', () => {
  it('rend le kind de l’agence du profil ACTIF, pas celui du premier profil', () => {
    const r = reponse([profil('agency_admin:1', 'standard', 3), profil('owner:2', 'individual', 9)], 'owner:2');
    expect(natureDeLEspaceActif(r)).toBe('individual');
  });

  it('rend standard pour un profil actif en agence standard', () => {
    expect(natureDeLEspaceActif(reponse([profil('agent:1', 'standard')], 'agent:1'))).toBe('standard');
  });

  it('rend sans-agence pour un compte sans aucun profil (client)', () => {
    expect(natureDeLEspaceActif(reponse([], null))).toBe('sans-agence');
  });

  it('rend sans-agence pour un profil actif rattaché à aucune agence', () => {
    expect(natureDeLEspaceActif(reponse([profil('service_provider:1', null, null)], 'service_provider:1'))).toBe(
      'sans-agence',
    );
  });

  it.each([
    ['réponse absente (chargement, erreur)', undefined],
    ['kind non transmis', reponse([profil('agent:1', undefined)], 'agent:1')],
    ['kind null', reponse([profil('agent:1', null)], 'agent:1')],
    ['profil actif absent de la liste', reponse([profil('agent:1', 'standard')], 'agent:99')],
    ['des profils mais aucun actif', reponse([profil('agent:1', 'standard')], null)],
  ])('rend inconnue quand %s', (_cas, r) => {
    expect(natureDeLEspaceActif(r)).toBe('inconnue');
  });
});

describe('peutProposerUnGroupe', () => {
  it.each([
    ['standard', true],
    ['sans-agence', true],
    ['individual', false],
    // Fail-closed : un bouton qui apparaît puis disparaît sous le pouce est pire qu'un bouton qui
    // arrive une fraction de seconde après la liste.
    ['inconnue', false],
  ] as const)('%s → %s', (nature, attendu) => {
    expect(peutProposerUnGroupe(nature)).toBe(attendu);
  });
});
