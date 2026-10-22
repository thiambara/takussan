/**
 * TCK-1343 (P125.02) — « Convertir quand même » envoie `allow_duplicate`, que l'API lit pour
 * passer outre le 409 `customer.duplicate` ; la conversion ordinaire n'envoie rien.
 */
import { describe, it, expect, vi } from 'vitest';

const formes = vi.hoisted(() => [] as Array<{ body?: (v: unknown) => unknown }>);

vi.mock('@/hooks/useApiQuery', () => ({
  useApiMutation: (shape: { body?: (v: unknown) => unknown }) => {
    formes.push(shape);
    return {};
  },
  useApiQuery: () => ({}),
}));

import { useConvertLead } from '../contact-leads';

describe('useConvertLead — TCK-1343', () => {
  it('n’envoie `allow_duplicate` que pour forcer', () => {
    useConvertLead();
    const body = formes.at(-1)?.body;
    expect(body?.({ id: 1 })).toEqual({});
    expect(body?.({ id: 1, allow_duplicate: true })).toEqual({ allow_duplicate: true });
  });
});
