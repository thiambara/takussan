/**
 * TCK-2475 — la barre suggère au fil de la frappe : la saisie comprise en tête (AC1), les récentes
 * et les populaires sur un champ vide (AC2), l'alerte pré-remplie quand rien ne correspond (AC3).
 *
 * Le hook `useSuggest` est le VRAI (anti-rebond, cache par saisie, `keepPreviousData`) : seul
 * `apiRequest` est doublé, réponse par réponse, pour éprouver aussi l'ordre d'arrivée. Aucune
 * dépendance à l'API locale.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import frMessages from '@/messages/fr.json';
import type { SuggestResponse } from '@/types/search';
import { RECHERCHES_RECENTES_CLE, lireRecherchesRecentes, retenirRecherche } from '@/lib/recherches-recentes';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/fr/properties',
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: null, user: null }),
}));

/** Les réponses de l'API, par saisie ; une saisie absente reste EN ATTENTE (promesse jamais tenue). */
const api = vi.hoisted(() => ({
  reponses: new Map<string, unknown>(),
  differees: new Map<string, (v: unknown) => void>(),
  differer: new Set<string>(),
  saisies: [] as string[],
}));

vi.mock('@/lib/api', async (importActual) => {
  const reel = await importActual<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiRequest: vi.fn((chemin: string) => {
      const q = new URL(chemin, 'http://x').searchParams.get('q') ?? '';
      api.saisies.push(q);
      if (api.differer.has(q)) return new Promise((resolve) => api.differees.set(q, resolve));
      if (api.reponses.has(q)) return Promise.resolve(api.reponses.get(q));
      return new Promise(() => {});
    }),
  };
});

/** Le dialogue d'alerte est doublé : on vérifie ce qu'on lui PASSE (critères, case cochée). */
const dialogue = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock('@/components/favorites/SaveSearchDialog', () => ({
  SaveSearchDialog: (props: Record<string, unknown>) => {
    dialogue.props = props;
    return <div role="dialog" aria-label="alerte" />;
  },
}));

import { SearchAutocomplete } from '../SearchAutocomplete';

function vide(data: Partial<SuggestResponse['data']> = {}): SuggestResponse {
  return {
    data: {
      interpretation: null,
      completions: [],
      popular: [],
      places: [],
      previews: [],
      cities: [],
      neighborhoods: [],
      property_types: [],
      ...data,
    },
  };
}

const APPART_3CH_ALMADIES = vide({
  interpretation: {
    criteria: { type: 'apartment', bedrooms: 3, city: 'Dakar', location: 'Almadies' },
    parts: [
      { key: 'type', value: 'apartment', from: 0, to: 6 },
      { key: 'bedrooms', value: 3, from: 7, to: 10 },
      { key: 'location', value: 'Almadies', from: 11, to: 19 },
    ],
    residue: null,
    count: 3,
  },
  places: [
    { kind: 'neighborhood', label: 'Almadies', city: 'Dakar', count: 9, criteria: { city: 'Dakar', location: 'Almadies' } },
  ],
  previews: [
    {
      id: 857,
      slug: 'appartement-3-chambres-a-almadies-pE41ZD',
      title: 'Appartement 3 chambres aux Almadies',
      price: 450000,
      rent_period: 'monthly',
      contract_type: 'rent',
      neighborhood: 'Almadies',
      city: 'Dakar',
      photo_url: null,
    },
  ],
});

const APPART = vide({
  interpretation: {
    criteria: { type: 'apartment' },
    parts: [{ key: 'type', value: 'apartment', from: 0, to: 6 }],
    residue: null,
    count: 33,
  },
});

function monter(node: React.ReactNode = <SearchAutocomplete />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="fr" messages={frMessages} timeZone="Africa/Dakar">{node}</NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function optionsDuPanneau(): HTMLElement[] {
  return within(screen.getByRole('listbox')).getAllByRole('option');
}

beforeEach(() => {
  push.mockReset();
  api.reponses = new Map();
  api.differees = new Map();
  api.differer = new Set();
  api.saisies = [];
  dialogue.props = null;
  window.localStorage.clear();
});

describe('AC1 — la saisie comprise en tête, et Entrée la valide', () => {
  it('« appart 3ch almadies » : la compréhension en première ligne, en libellés de filtre, avec son compte', async () => {
    api.reponses.set('', vide());
    api.reponses.set('appart 3ch almadies', APPART_3CH_ALMADIES);
    monter();
    await userEvent.type(screen.getByRole('combobox'), 'appart 3ch almadies');

    const premiere = await waitFor(() => {
      const o = optionsDuPanneau()[0];
      expect(o).toHaveTextContent('Appartement');
      return o!;
    });
    // Dans l'ordre TAPÉ, puis la ville qu'implique le quartier — les libellés des puces de filtre.
    const puces = Array.from(premiere.querySelectorAll('span.rounded-full')).map((e) => e.textContent);
    expect(puces).toEqual(['Appartement', '3+ ch.', 'Quartier : Almadies', 'Dakar']);
    expect(premiere).toHaveTextContent('3 biens');
    // Puis le lieu, et le bien en aperçu.
    expect(screen.getByRole('option', { name: /Almadies.*Dakar.*9/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Appartement 3 chambres aux Almadies/ })).toBeInTheDocument();
  });

  it('Entrée ouvre la liste filtrée par ces critères, et la recherche entre dans les récentes', async () => {
    api.reponses.set('', vide());
    api.reponses.set('appart 3ch almadies', APPART_3CH_ALMADIES);
    monter();
    const champ = screen.getByRole('combobox');
    await userEvent.type(champ, 'appart 3ch almadies');
    await screen.findByText('3 biens');

    fireEvent.keyDown(champ, { key: 'Enter' });

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/fr/properties?location=Almadies&city=Dakar&type=apartment&bedrooms=3');
    expect(lireRecherchesRecentes()).toEqual([
      { texte: 'appart 3ch almadies', qs: 'location=Almadies&city=Dakar&type=apartment&bedrooms=3' },
    ]);
  });

  it('le texte restant part en `q`, les critères compris à côté', async () => {
    api.reponses.set('', vide());
    api.reponses.set('appart me', vide({ interpretation: { ...APPART.data.interpretation!, residue: 'me', count: 12 } }));
    monter();
    const champ = screen.getByRole('combobox');
    await userEvent.type(champ, 'appart me');
    await screen.findByText('12 biens');
    fireEvent.keyDown(champ, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/fr/properties?type=apartment&q=me');
  });

  it('rien ne clignote, et une compréhension PÉRIMÉE reste affichée mais n’est jamais validée', async () => {
    api.reponses.set('', vide());
    api.reponses.set('appart', APPART);
    monter();
    const champ = screen.getByRole('combobox');
    await userEvent.type(champ, 'appart');
    await screen.findByText('33 biens');

    // « appart 3ch » part au serveur et n'en revient pas : la ligne d'« appart » reste à l'écran…
    await userEvent.type(champ, ' 3ch');
    await waitFor(() => expect(api.saisies).toContain('appart 3ch'));
    expect(screen.getByText('33 biens')).toBeInTheDocument();
    expect(optionsDuPanneau()[0]).toHaveTextContent('Appartement');

    // … mais Entrée ne la valide pas : elle répond à une autre saisie. Le texte part tel quel.
    fireEvent.keyDown(champ, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/fr/properties?q=appart+3ch');
  });

  it('une réponse arrivée APRÈS une plus récente ne l’écrase pas', async () => {
    api.reponses.set('', vide());
    api.differer.add('vil');
    api.differer.add('villa');
    monter();
    const champ = screen.getByRole('combobox');
    await userEvent.type(champ, 'vil');
    await waitFor(() => expect(api.differees.has('vil')).toBe(true));
    await userEvent.type(champ, 'la');
    await waitFor(() => expect(api.differees.has('villa')).toBe(true));

    const lieu = (label: string) => vide({ places: [{ kind: 'city', label, city: null, count: 1, criteria: { city: label } }] });
    await act(async () => api.differees.get('villa')!(lieu('Villaréponse')));
    await screen.findByRole('option', { name: /Villaréponse/ });
    await act(async () => api.differees.get('vil')!(lieu('Vilpérimée')));

    expect(screen.getByRole('option', { name: /Villaréponse/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Vilpérimée/ })).toBeNull();
  });

  it('un aperçu ouvre la fiche du bien', async () => {
    api.reponses.set('', vide());
    api.reponses.set('appart 3ch almadies', APPART_3CH_ALMADIES);
    monter();
    await userEvent.type(screen.getByRole('combobox'), 'appart 3ch almadies');
    await userEvent.click(await screen.findByRole('option', { name: /Appartement 3 chambres aux Almadies/ }));
    expect(push).toHaveBeenCalledWith('/fr/properties/appartement-3-chambres-a-almadies-pE41ZD');
  });

  it('clavier : les flèches parcourent les options (activedescendant), Échap et Tab referment', async () => {
    api.reponses.set('', vide());
    api.reponses.set('appart 3ch almadies', APPART_3CH_ALMADIES);
    monter();
    const champ = screen.getByRole('combobox');
    await userEvent.type(champ, 'appart 3ch almadies');
    await screen.findByText('3 biens');
    // L'annonce du nombre de suggestions, pour les lecteurs d'écran.
    expect(screen.getByRole('status')).toHaveTextContent('3 suggestions');

    fireEvent.keyDown(champ, { key: 'ArrowDown' });
    fireEvent.keyDown(champ, { key: 'ArrowDown' });
    const active = document.getElementById(champ.getAttribute('aria-activedescendant')!);
    expect(active).toHaveAttribute('aria-selected', 'true');
    expect(active).toHaveTextContent('Almadies');
    fireEvent.keyDown(champ, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/fr/properties?city=Dakar&location=Almadies');

    await userEvent.click(champ);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(champ, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.keyDown(champ, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(champ, { key: 'Tab' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

describe('AC2 — champ vide : récentes et populaires', () => {
  it('au focus : les récentes de l’appareil, les populaires, et Louer / Acheter', async () => {
    retenirRecherche({ texte: 'villa saly', qs: 'q=villa+saly' });
    api.reponses.set('', vide({
      popular: [
        { text: '', criteria: { city: 'Thiès', type: 'land' }, count: 2 },
        { text: 'appartement meuble', criteria: {}, count: 7 },
      ],
    }));
    monter();
    await userEvent.click(screen.getByRole('combobox'));

    expect(await screen.findByRole('group', { name: 'Récentes' })).toHaveTextContent('villa saly');
    const populaires = await screen.findByRole('group', { name: 'Populaires' });
    // Une recherche par critères seuls se dit par les libellés des filtres.
    expect(within(populaires).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Thiès · Terrain2 biens',
      'appartement meuble7 biens',
    ]);
    expect(screen.getByRole('option', { name: 'Louer' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Acheter' })).toBeInTheDocument();

    await userEvent.click(within(populaires).getAllByRole('option')[0]!);
    expect(push).toHaveBeenCalledWith('/fr/properties?city=Thi%C3%A8s&type=land');
  });

  it('une recherche faite apparaît dans les récentes, et se rejoue', async () => {
    api.reponses.set('', vide());
    api.reponses.set('maison ngor', vide());
    const { unmount } = monter();
    const champ = screen.getByRole('combobox');
    await userEvent.type(champ, 'maison ngor');
    fireEvent.keyDown(champ, { key: 'Enter' });
    expect(push).toHaveBeenLastCalledWith('/fr/properties?q=maison+ngor');
    unmount();

    monter();
    await userEvent.click(screen.getByRole('combobox'));
    const recente = within(await screen.findByRole('group', { name: 'Récentes' })).getByRole('option', { name: 'maison ngor' });
    await userEvent.click(recente);
    expect(push).toHaveBeenLastCalledWith('/fr/properties?q=maison+ngor');
  });

  it('les récentes s’effacent', async () => {
    retenirRecherche({ texte: 'villa saly', qs: 'q=villa+saly' });
    api.reponses.set('', vide());
    monter();
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Effacer les récentes' }));
    expect(screen.queryByRole('group', { name: 'Récentes' })).toBeNull();
    expect(window.localStorage.getItem(RECHERCHES_RECENTES_CLE)).toBeNull();
    // Le panneau reste ouvert : les populaires et les raccourcis restent offerts.
    expect(screen.getByRole('option', { name: 'Louer' })).toBeInTheDocument();
  });

  it('un raccourci ouvre la liste de la transaction', async () => {
    api.reponses.set('', vide());
    monter();
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByRole('option', { name: 'Louer' }));
    expect(push).toHaveBeenCalledWith('/fr/properties?contract_type=rent');
  });
});

describe('AC3 — sans résultat : l’alerte, pré-remplie', () => {
  const SANS_BIEN = vide({ interpretation: { ...APPART_3CH_ALMADIES.data.interpretation!, count: 0 } });

  it('compte nul : la ligne comprise reste une issue (« Voir des biens proches ») et l’alerte est proposée', async () => {
    api.reponses.set('', vide());
    api.reponses.set('appart 3ch almadies', SANS_BIEN);
    monter(<SearchAutocomplete imposer={{ contract_type: 'rent' }} />);
    const champ = screen.getByRole('combobox');
    await userEvent.type(champ, 'appart 3ch almadies');

    const comprise = await screen.findByRole('option', { name: /Voir des biens proches/ });
    expect(comprise).not.toHaveTextContent('0 bien');
    const alerte = screen.getByRole('option', { name: 'Être alerté quand un bien correspond' });

    await userEvent.click(alerte);
    await screen.findByRole('dialog');
    expect(dialogue.props).toMatchObject({
      alerteCochee: true,
      criteria: { location: 'Almadies', city: 'Dakar', contract_type: 'rent', type: ['apartment'], bedrooms: 3 },
    });
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('compte nul : la ligne comprise mène quand même à la liste (elle peut s’élargir)', async () => {
    api.reponses.set('', vide());
    api.reponses.set('appart 3ch almadies', SANS_BIEN);
    monter();
    await userEvent.click(await (async () => {
      await userEvent.type(screen.getByRole('combobox'), 'appart 3ch almadies');
      return screen.findByRole('option', { name: /Voir des biens proches/ });
    })());
    expect(push).toHaveBeenCalledWith('/fr/properties?location=Almadies&city=Dakar&type=apartment&bedrooms=3');
  });

  it('des biens : pas d’alerte proposée', async () => {
    api.reponses.set('', vide());
    api.reponses.set('appart 3ch almadies', APPART_3CH_ALMADIES);
    monter();
    await userEvent.type(screen.getByRole('combobox'), 'appart 3ch almadies');
    await screen.findByText('3 biens');
    expect(screen.queryByRole('option', { name: 'Être alerté quand un bien correspond' })).toBeNull();
  });
});
