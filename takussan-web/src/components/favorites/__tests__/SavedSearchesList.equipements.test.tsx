/**
 * TCK-633 — le résumé d'une recherche sauvegardée nomme ses équipements dans la langue de
 * l'écran, comme les puces de la recherche (lot E) : un équipement du catalogue est traduit par
 * son slug (`libelleEquipementParNom`), un équipement proposé par un annonceur reste tel quel.
 *
 * Avant : `SavedSearchesList` appelait `puceDeChaqueFiltreActif` sans traducteur `equipement`,
 * et « Piscine » restait « Piscine » sous l'anglais et le wolof.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl, type LocaleDeTest } from '@/test/intl';
import { SavedSearchesList } from '../SavedSearchesList';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }),
}));

function recherche(tags: string) {
  return {
    id: 7,
    user_id: 1,
    name: 'Ma recherche',
    criteria: { tags },
    notification_frequency: 'daily',
    is_active: true,
    results_count: 0,
    alert_channels: ['inapp'],
    created_at: null,
  };
}

function monte(locale: LocaleDeTest, tags: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ data: [recherche(tags)] }), { status: 200 })),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(<QueryClientProvider client={client}><SavedSearchesList /></QueryClientProvider>, locale),
  );
}

describe('<SavedSearchesList> — équipements traduits (TCK-633)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('en anglais : le catalogue traduit, l’équipement proposé tel quel', async () => {
    monte('en', 'Piscine,Jardin potager');
    expect(await screen.findByText('Amenities: Swimming pool, Jardin potager')).toBeInTheDocument();
  });

  it('en wolof : le catalogue traduit', async () => {
    monte('wo', 'Piscine,Climatisation');
    expect(await screen.findByText('Jumtukaay : Pisin, Klimatisasioŋ')).toBeInTheDocument();
  });

  it('en français : un équipement d’annonceur hors catalogue reste tel quel', async () => {
    monte('fr', 'Hammam maison');
    expect(await screen.findByText('Équipements : Hammam maison')).toBeInTheDocument();
  });
});
