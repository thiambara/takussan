/**
 * TCK-591 — la querystring de l'agenda porte `mine=1` et répète `types[]` ; le prestataire n'y
 * écrit que `maintenance` (AC27).
 */
import { describe, expect, it, vi } from 'vitest';

const useApiQuery = vi.fn();
vi.mock('@/hooks/useApiQuery', () => ({ useApiQuery: (...args: unknown[]) => useApiQuery(...args) }));

import { useCalendar } from '../calendar';

describe('useCalendar — chemin', () => {
  it('écrit types[]=maintenance seul et mine=1', () => {
    useCalendar({ start_date: '2026-10-01', end_date: '2026-10-31', types: ['maintenance'], mine: true });

    const path = decodeURIComponent(String(useApiQuery.mock.calls[0][1]));
    expect(path).toBe('/api/calendar?start_date=2026-10-01&end_date=2026-10-31&mine=1&types[]=maintenance');
  });
});
