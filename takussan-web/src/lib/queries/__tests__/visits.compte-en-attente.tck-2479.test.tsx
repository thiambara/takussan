/**
 * TCK-2479 (revue, I2) — le compteur « visites en attente » du menu compte ce que l'onglet
 * « Demandées » montre : `scheduled` ET à venir. Sans borne, une demande d'hier jamais confirmée
 * restait comptée pour toujours, sur une page qui la range dans « Passées ».
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';

const appels = vi.hoisted(() => [] as string[]);

vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiRequest: vi.fn(async (chemin: string) => {
      appels.push(chemin);
      return { data: [], meta: { total: 0, last_page: 1 } };
    }),
  };
});
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));

import { parametresDuCompteDesVisitesEnAttente, usePendingVisitsCount } from '../visits';

function enveloppe() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Enveloppe({ children }: { readonly children: ReactNode }) {
    return (
      <NextIntlClientProvider locale="fr" messages={{}}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </NextIntlClientProvider>
    );
  };
}

/** La borne basse lue dans un chemin, décodée. */
function borne(chemin: string): string | null {
  return new URL(chemin, 'https://api.test').searchParams.get('filter[scheduled_at_min]');
}

afterEach(() => {
  vi.useRealTimers();
  appels.length = 0;
});

describe('usePendingVisitsCount — le périmètre de l’onglet « Demandées » (TCK-2479, revue I2)', () => {
  it('compte les visites `scheduled` À VENIR : borne basse à la minute de la lecture', () => {
    expect(parametresDuCompteDesVisitesEnAttente(new Date('2026-11-05T10:17:42.123Z')).filter).toEqual({
      status: 'scheduled',
      scheduled_at_min: '2026-11-05T10:17:00.000Z',
    });
  });

  it('la borne se prend À CHAQUE LECTURE, pas au rendu', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-05T10:17:42.000Z'));
    const { result } = renderHook(() => usePendingVisitsCount(), { wrapper: enveloppe() });
    await waitFor(() => expect(appels).toHaveLength(1));
    expect(appels[0]).toMatch(/^\/api\/property-visits\?/);
    expect(new URL(appels[0]!, 'https://api.test').searchParams.get('filter[status]')).toBe('scheduled');
    expect(borne(appels[0]!)).toBe('2026-11-05T10:17:00.000Z');

    // Une heure plus tard, sans nouveau rendu : la relecture (le sondage) borne à la nouvelle minute.
    vi.setSystemTime(new Date('2026-11-05T11:17:42.000Z'));
    await result.current.refetch();
    expect(appels).toHaveLength(2);
    expect(borne(appels[1]!)).toBe('2026-11-05T11:17:00.000Z');
  });
});
