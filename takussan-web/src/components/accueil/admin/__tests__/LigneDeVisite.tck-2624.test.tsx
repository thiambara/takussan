/**
 * TCK-2624 (lot 3, fidélité) — une visite que l'on ne confirme pas (bailleur d'un bien d'agence,
 * décision 7, ou geste refusé par l'API) garde UN geste, « Voir », qui prend la place du bouton
 * tonal de la rangée (maquette `app-accueil` a-2 : `BoutonTonal h-8 px-3 text-[13px]`), et non un
 * lien discret.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import type { PropertyVisit } from '@/types/visit';

import { LigneDeVisite } from '../LigneDeVisite';

vi.mock('@/components/ui/toast', async (original) => ({
  ...(await original<typeof import('@/components/ui/toast')>()),
  useToast: () => ({ add: () => {} }),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 21, roles: ['owner'] }, token: 'jeton' }) }));

const VISITE = {
  id: 601,
  status: 'scheduled',
  scheduled_at: '2026-11-14T11:00:00Z',
  preferred_window: null,
  property: { id: 3, title: 'Maison familiale avec jardin', address: { neighborhood: 'Ouakam' } },
  agent: { id: 5, first_name: 'Sokhna', last_name: 'Sène', name: 'Sokhna Sène' },
} as unknown as PropertyVisit;

const monter = (refusee: boolean) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {withIntl(<LigneDeVisite v={VISITE} refusee={refusee} onRefus={() => {}} />)}
    </QueryClientProvider>,
  );

describe('LigneDeVisite — le geste qui reste', () => {
  it('sans confirmation : « Voir » seul, tonal (h-8, fond secondaire), vers la visite', () => {
    monter(true);
    const voir = screen.getByRole('link', { name: 'Voir' });
    expect(voir.getAttribute('href')).toBe('/app/visits/601');
    expect(voir.className).toMatch(/\bbg-secondary\b/);
    expect(voir.className).toMatch(/\bh-8\b/);
    expect(screen.queryByRole('button', { name: 'Confirmer' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Autre créneau' })).toBeNull();
  });

  it('avec confirmation : « Autre créneau » reste discret, « Confirmer » est le bouton tonal', () => {
    monter(false);
    expect(screen.getByRole('link', { name: 'Autre créneau' }).className).not.toMatch(/\bbg-secondary\b/);
    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeTruthy();
  });
});
