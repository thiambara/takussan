/**
 * Revue adverse de la recherche (2026-11-04) — trois défauts de la barre de TCK-2475, chacun reproduit ici avant d'être
 * corrigé :
 *
 * - n° 5 : le compte annoncé (« 12 biens ») était pris SANS les filtres que la navigation garde — ceux de l'URL courante
 *   et le contrat imposé (« Louer / Acheter ») — et Entrée ouvrait une liste plus courte, voire vide ;
 * - n° 6 : une saisie de 31 caractères tapée à 150 ms par touche coûtait 29 appels, face à une borne de 60 par minute ;
 * - n° 9 : « Voir des biens proches » s'affichait à 0 bien même quand la liste ne s'élargirait pas (ADR-0024).
 *
 * Le hook `useSuggest` est le vrai ; seul `apiRequest` est doublé. Aucune dépendance à l'API locale.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import frMessages from '@/messages/fr.json';
import type { SuggestInterpretation, SuggestResponse } from '@/types/search';

const push = vi.fn();
const courant = vi.hoisted(() => ({ qs: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(courant.qs),
  usePathname: () => '/fr/properties',
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: null, user: null }) }));

const api = vi.hoisted(() => ({ reponses: new Map<string, unknown>(), appels: [] as string[] }));
vi.mock('@/lib/api', async (importActual) => {
  const reel = await importActual<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiRequest: vi.fn((chemin: string) => {
      api.appels.push(chemin);
      const q = new URL(chemin, 'http://x').searchParams.get('q') ?? '';
      return Promise.resolve(api.reponses.get(q) ?? vide());
    }),
  };
});

vi.mock('@/components/favorites/SaveSearchDialog', () => ({
  SaveSearchDialog: () => <div role="dialog" aria-label="alerte" />,
}));

import { SearchAutocomplete } from '../SearchAutocomplete';

function vide(data: Partial<SuggestResponse['data']> = {}): SuggestResponse {
  return {
    data: { interpretation: null, completions: [], popular: [], places: [], previews: [], cities: [], neighborhoods: [], property_types: [], ...data },
  };
}

function comprise(interpretation: Partial<SuggestInterpretation>): SuggestResponse {
  return vide({
    interpretation: {
      criteria: { type: 'villa', city: 'Dakar', location: 'Almadies' },
      parts: [
        { key: 'type', value: 'villa', from: 0, to: 5 },
        { key: 'location', value: 'Almadies', from: 6, to: 14 },
      ],
      residue: null,
      count: 12,
      ...interpretation,
    },
  });
}

function monter(node: React.ReactNode = <SearchAutocomplete />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const enveloppe = (n: React.ReactNode) => (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="fr" messages={frMessages} timeZone="Africa/Dakar">{n}</NextIntlClientProvider>
    </QueryClientProvider>
  );
  const rendu = render(enveloppe(node));
  return { ...rendu, remonter: (n: React.ReactNode) => rendu.rerender(enveloppe(n)) };
}

/** Les appels de suggestion portant une saisie (le champ vide, au focus, interroge les populaires). */
function appelsDeSaisie(): URLSearchParams[] {
  return api.appels
    .filter((c) => c.startsWith('/api/search/suggest'))
    .map((c) => new URL(c, 'http://x').searchParams)
    .filter((p) => (p.get('q') ?? '') !== '');
}

beforeEach(() => {
  push.mockReset();
  api.reponses = new Map();
  api.appels = [];
  courant.qs = '';
  window.localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe('n° 5 — le compte annoncé est celui de la liste où l’on arrive', () => {
  it('la requête du compte porte les filtres de l’URL et le contrat imposé, sous les noms de la liste ; Entrée ouvre la liste de cette base', async () => {
    courant.qs = 'price_max=100000&furnished=true&q=ancien&page=3&sort=-price';
    api.reponses.set('villa almadies', comprise({}));
    monter(<SearchAutocomplete imposer={{ contract_type: 'rent' }} />);
    const champ = screen.getByRole('combobox');
    await userEvent.type(champ, 'villa almadies');
    await screen.findByText('12 biens');

    const requete = appelsDeSaisie().find((p) => p.get('q') === 'villa almadies');
    expect(requete, 'aucun appel pour « villa almadies »').toBeDefined();
    expect(Object.fromEntries(requete!)).toEqual({
      q: 'villa almadies',
      limit: '10',
      contract_type: 'rent',
      price_max: '100000',
      furnished: 'true',
    });

    fireEvent.keyDown(champ, { key: 'Enter' });
    const ouverte = new URL(String(push.mock.calls[0]?.[0]), 'http://x').searchParams;
    // La liste = la base envoyée, les critères compris par-dessus ; le tri (contrôle) reste, la page repart de 1.
    expect(Object.fromEntries(ouverte)).toEqual({
      price_max: '100000',
      furnished: 'true',
      sort: '-price',
      contract_type: 'rent',
      location: 'Almadies',
      city: 'Dakar',
      type: 'villa',
    });
  });

  it('une autre base est une autre question : changer le contrat imposé relance le compte de la même saisie', async () => {
    api.reponses.set('villa almadies', comprise({}));
    const { remonter } = monter(<SearchAutocomplete imposer={{ contract_type: 'rent' }} />);
    const champ = screen.getByRole('combobox');
    await userEvent.type(champ, 'villa almadies');
    await screen.findByText('12 biens');

    remonter(<SearchAutocomplete imposer={{ contract_type: 'sale' }} />);
    await waitFor(() =>
      expect(appelsDeSaisie().some((p) => p.get('q') === 'villa almadies' && p.get('contract_type') === 'sale')).toBe(true),
    );
  });
});

describe('n° 6 — le rythme de frappe ne coûte pas un appel par touche', () => {
  it('31 caractères tapés à 150 ms par touche : un seul appel, pour la saisie finale', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    monter();
    const champ = screen.getByRole('combobox');
    act(() => champ.focus());
    const texte = 'appartement 3 chambres almadies';
    for (let i = 1; i <= texte.length; i++) {
      act(() => {
        fireEvent.change(champ, { target: { value: texte.slice(0, i) } });
      });
      await act(async () => {
        vi.advanceTimersByTime(150);
      });
    }
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(appelsDeSaisie().map((p) => p.get('q'))).toEqual([texte]);
  });

  it('une saisie identique aux espaces près ne repart pas au serveur', async () => {
    api.reponses.set('villa almadies', comprise({}));
    monter();
    const champ = screen.getByRole('combobox');
    await userEvent.type(champ, 'villa almadies');
    await screen.findByText('12 biens');
    const avant = appelsDeSaisie().length;

    fireEvent.change(champ, { target: { value: ' villa   almadies ' } });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(appelsDeSaisie().length).toBe(avant);
    // La compréhension reste celle de la saisie courante : Entrée la valide toujours.
    fireEvent.keyDown(champ, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/fr/properties?location=Almadies&city=Dakar&type=villa');
  });
});

describe('n° 9 — « Voir des biens proches » seulement si la liste s’élargira', () => {
  it('compte nul sans résidu : « 0 bien », pas de promesse, et l’alerte reste proposée', async () => {
    api.reponses.set('villa piscine', comprise({ count: 0, residue: null }));
    monter();
    await userEvent.type(screen.getByRole('combobox'), 'villa piscine');
    await screen.findByText('0 bien');
    expect(screen.queryByText('Voir des biens proches')).toBeNull();
    expect(screen.getByRole('option', { name: 'Être alerté quand un bien correspond' })).toBeInTheDocument();
  });

  it('compte nul sous un résidu d’un seul mot : « 0 bien »', async () => {
    api.reponses.set('maison sans piscine', comprise({ count: 0, residue: 'sans' }));
    monter();
    await userEvent.type(screen.getByRole('combobox'), 'maison sans piscine');
    await screen.findByText('0 bien');
    expect(screen.queryByText('Voir des biens proches')).toBeNull();
  });

  it('compte nul sous un résidu de deux mots : la liste s’élargira, la promesse est tenue', async () => {
    api.reponses.set('villa vue mer', comprise({ count: 0, residue: 'vue mer' }));
    monter();
    await userEvent.type(screen.getByRole('combobox'), 'villa vue mer');
    await screen.findByText('Voir des biens proches');
    expect(screen.queryByText('0 bien')).toBeNull();
  });
});
