import { describe, expect, it, vi } from 'vitest';

import { useApiMutation } from '@/hooks/useApiQuery';
import { useBuyBoost } from '../api';

vi.mock('@/hooks/useApiQuery', () => ({ useApiMutation: vi.fn(), useApiQuery: vi.fn() }));

describe('useBuyBoost (TCK-822)', () => {
  it('envoie la clé d’idempotence du dialogue dans l’en-tête Idempotency-Key', () => {
    useBuyBoost(47, 'ouverture-1-2');

    expect(vi.mocked(useApiMutation)).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST' }),
      expect.objectContaining({ request: { headers: { 'Idempotency-Key': 'ouverture-1-2' } } }),
    );
  });
});
