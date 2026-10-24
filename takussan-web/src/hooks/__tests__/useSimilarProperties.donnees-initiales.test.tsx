/**
 * TCK-1483 (P103.07) — avec les similaires reçus du serveur, le navigateur ne les redemande pas.
 */
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { PropertyListItem } from '@/types/property';
import { useSimilarProperties } from '../useSimilarProperties';

const SIMILAIRES = [{ id: 1, slug: 'bien-1', title: 'Bien 1' }] as unknown as PropertyListItem[];

describe('useSimilarProperties — données initiales (TCK-1483)', () => {
  let reseau: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    reseau = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }));
    vi.stubGlobal('fetch', reseau);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('rend les données initiales tout de suite, sans requête', async () => {
    const { result } = renderHook(() => useSimilarProperties('studio', SIMILAIRES), {
      wrapper: ({ children }) => withIntl(<>{children}</>),
    });

    expect(result.current).toMatchObject({ data: SIMILAIRES, loading: false, error: null });
    await new Promise((r) => setTimeout(r, 20));
    expect(reseau).not.toHaveBeenCalled();
  });

  it('sans données initiales, la lecture du navigateur reste', async () => {
    renderHook(() => useSimilarProperties('studio', null), {
      wrapper: ({ children }) => withIntl(<>{children}</>),
    });
    await vi.waitFor(() => expect(reseau).toHaveBeenCalledTimes(1));
    expect(String(reseau.mock.calls[0][0])).toContain('/public/properties/studio/similar');
  });
});
