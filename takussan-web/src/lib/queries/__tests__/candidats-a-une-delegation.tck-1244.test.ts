/**
 * P120.02 (TCK-1244) — `GET /api/agencies/{id}/members` rend aussi les administrateurs de
 * l'agence, y compris l'admin seul (un membre promu `agency_admin` perd ses profils d'agent et de
 * bailleur). `RoleDelegationService::create` refuse ce bénéficiaire : les candidats à une
 * délégation demandent donc `filter[role]=agent,owner`, la condition du service, au serveur.
 */
import { describe, expect, it, vi } from 'vitest';

const appels = vi.hoisted(() => [] as unknown[][]);

vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (...args: unknown[]) => {
    appels.push(args);
    return { data: undefined, isLoading: false };
  },
  useApiMutation: vi.fn(),
}));

import { useDelegationCandidates } from '../role-delegations';
import { buildQueryString } from '@/lib/api';
import type { SpatieQueryParams } from '@/types/api';

describe('useDelegationCandidates', () => {
  it('ne demande que les agents et les bailleurs de l’agence, la condition du service', () => {
    useDelegationCandidates(7);

    const [, chemin, options] = appels.at(-1) as [unknown, string, { params: SpatieQueryParams }];
    expect(chemin).toBe('/api/agencies/7/members');
    expect(options.params.filter).toEqual({ role: 'agent,owner' });
    expect(decodeURIComponent(buildQueryString(options.params))).toContain('filter[role]=agent,owner');
  });
});
