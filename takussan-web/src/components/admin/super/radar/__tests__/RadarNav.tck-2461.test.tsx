import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { avecGestes } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import { RadarNav } from '../RadarNav';

/** TCK-2461 — les quatre espaces se rejoignent d'un clic, et l'on voit où l'on est, fiche comprise. */

let chemin = '/super-admin/radar';
vi.mock('next/navigation', async (original) => ({
  ...(await original<typeof import('next/navigation')>()),
  usePathname: () => chemin,
}));

function rendre() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(<QueryClientProvider client={queryClient}>{avecGestes(<RadarNav />)}</QueryClientProvider>));
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: { follow_ups_due: 3 } }), { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());

describe('La navigation du Radar', () => {
  it.each([
    ['/super-admin/radar', 'radar-lien-annonces'],
    ['/super-admin/radar/42', 'radar-lien-annonces'],
    ['/super-admin/radar/advertisers', 'radar-lien-annonceurs'],
    ['/super-admin/radar/advertisers/7', 'radar-lien-annonceurs'],
    ['/super-admin/radar/collecte', 'radar-lien-collecte'],
    ['/super-admin/radar/observatory', 'radar-lien-observatoire'],
  ])('sur %s, seule %s est courante', (valeur, attendue) => {
    chemin = valeur;
    rendre();
    const courantes = within(screen.getByTestId('radar-nav')).getAllByRole('link')
      .filter((lien) => lien.getAttribute('aria-current') === 'page');
    expect(courantes.map((lien) => lien.getAttribute('data-testid'))).toEqual([attendue]);
  });

  it('porte les relances dues sur Annonceurs', async () => {
    chemin = '/super-admin/radar';
    rendre();
    const pastille = await screen.findByTestId('radar-relances-dues');
    expect(screen.getByTestId('radar-lien-annonceurs')).toContainElement(pastille);
    expect(pastille).toHaveTextContent('3');
  });
});
