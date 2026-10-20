/**
 * TCK-1016 (P50.04) — le relevé de gérance d'un bailleur, lu par le personnel : `landlord_id` part
 * dans la requête et distingue la clé de cache ; sans lui, le relevé reste celui du lecteur.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useApiQuery = vi.fn();
vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (...args: unknown[]) => useApiQuery(...args),
  useApiMutation: vi.fn(),
}));

import { useOwnerStatement } from '../payments';

describe('useOwnerStatement — le bailleur désigné', () => {
  beforeEach(() => useApiQuery.mockReset());

  it('envoie landlord_id, et ne partage pas la clé du relevé du lecteur', () => {
    useOwnerStatement('2026-09', 42);
    useOwnerStatement('2026-09');

    const [cleBailleur, , optionsBailleur] = useApiQuery.mock.calls[0];
    const [cleLecteur, , optionsLecteur] = useApiQuery.mock.calls[1];
    expect(optionsBailleur.params.extra).toEqual({ period: '2026-09', landlord_id: 42 });
    expect(optionsLecteur.params.extra).toEqual({ period: '2026-09' });
    expect(cleBailleur).not.toEqual(cleLecteur);
  });
});
