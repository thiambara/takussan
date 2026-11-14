/**
 * TCK-2744 (contre-vérification, G5) — la grille des créneaux se juge sur la durée de la visite :
 * `useCreneauxDeVisite` envoie `duration_minutes` ET la porte dans sa clé de requête. Sans la durée
 * dans la clé, passer de 30 à 45 min ne relit rien : la grille de 30 min (09:30 libre) reste à
 * l'écran pour une visite de 45 min, que la confirmation refuse. Les écrans qui l'appellent moquent
 * le hook ; seul ce test lit la vraie clé.
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
      return { data: [] };
    }),
  };
});
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));

import { useCreneauxDeVisite } from '../visits';

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

/** La durée demandée par un appel à `/slots`, lue dans son chemin. */
function duree(chemin: string): string | null {
  return new URLSearchParams(chemin.split('?')[1] ?? '').get('duration_minutes');
}

afterEach(() => {
  appels.length = 0;
});

describe('useCreneauxDeVisite — la durée dans la clé (TCK-2744, G5)', () => {
  it('une autre durée relit la grille, avec cette durée', async () => {
    const { rerender } = renderHook(
      ({ minutes }: { minutes: number }) => useCreneauxDeVisite(12, '2026-11-20', 3, minutes),
      { wrapper: enveloppe(), initialProps: { minutes: 30 } },
    );
    await waitFor(() => expect(appels).toHaveLength(1));
    expect(appels[0]).toContain('/api/property-visits/slots');
    expect(duree(appels[0])).toBe('30');

    rerender({ minutes: 45 });

    await waitFor(() => expect(appels).toHaveLength(2));
    expect(duree(appels[1])).toBe('45');
  });
});
