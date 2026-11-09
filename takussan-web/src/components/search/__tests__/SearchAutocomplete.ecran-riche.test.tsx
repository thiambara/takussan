/**
 * TCK-2497 — l'écran de recherche « Riche et complet » : la surface `ecran` (téléphone) et la surface
 * `panneau` (bureau) du même composant. Les tests existants de `SearchAutocomplete` (surface `menu`)
 * restent tels quels (AC2) ; ceux-ci gardent ce que l'écran ajoute.
 *
 * Seul le réseau est doublé (`apiRequest` pour la suggestion et les domaines, `apiFetch` pour les
 * comptes « N nouveaux ») : le hook `useSuggest` et les hooks de données sont les vrais.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import frMessages from '@/messages/fr.json';
import type { SuggestResponse } from '@/types/search';
import { RECHERCHES_RECENTES_CLE, RECHERCHES_RECENTES_VUES_CLE } from '@/lib/recherches-recentes';

const push = vi.fn();
const url = vi.hoisted(() => ({ params: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(url.params),
  usePathname: () => '/fr/properties',
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: null, user: null }),
}));

const api = vi.hoisted(() => ({
  suggestions: new Map<string, unknown>(),
  domaines: new Map<string, unknown>(),
  chemins: [] as string[],
  /** Les comptes « N nouveaux » (recherche sans `facets`). */
  fetches: [] as string[],
  /** Les comptes par facette (recherche avec `facets`). */
  facettes: [] as string[],
  totalNouveaux: 4,
  /** `false` : l'API ne rend pas `meta.facets` (version antérieure à TCK-2517). */
  servirLesFacettes: true,
}));

/**
 * Un CATALOGUE factice, et une liste qui le filtre comme l'API : `contract_type`, `type` (liste),
 * `bedrooms` (minimum), `city`, `location`. Les facettes se comptent comme `PropertySearchService::facettes`,
 * chacune hors de son propre filtre. C'est ce qui permet de prouver que le compte d'une pastille est le
 * `meta.total` de la liste qu'elle ouvre — et pas un compte global, que le catalogue rend DIFFÉRENT.
 */
const catalogue = vi.hoisted(() => {
  type Bien = { contract_type: string; type: string; bedrooms: number; city: string; location: string };
  const b = (contract_type: string, type: string, bedrooms: number, city: string, location: string): Bien =>
    ({ contract_type, type, bedrooms, city, location });
  const BIENS: Bien[] = [
    b('rent', 'villa', 4, 'Dakar', 'Mermoz'),
    b('rent', 'villa', 3, 'Dakar', 'Ngor'),
    b('rent', 'apartment', 3, 'Dakar', 'Mermoz'),
    b('rent', 'apartment', 1, 'Dakar', 'Mermoz'),
    b('rent', 'apartment', 3, 'Thiès', 'HLM'),
    b('rent', 'studio', 1, 'Dakar', 'HLM'),
    b('sale', 'villa', 5, 'Dakar', 'Mermoz'),
    b('sale', 'villa', 4, 'Dakar', 'HLM'),
    b('sale', 'apartment', 3, 'Dakar', 'Ngor'),
    b('rent', 'villa', 3, 'Dakar', 'HLM'),
    b('rent', 'apartment', 2, 'Dakar', 'HLM'),
  ];
  function liste(p: URLSearchParams, sauf?: 'type' | 'location'): Bien[] {
    return BIENS.filter((x) =>
      (!p.get('contract_type') || x.contract_type === p.get('contract_type')) &&
      (sauf === 'type' || !p.get('type') || p.get('type')!.split(',').includes(x.type)) &&
      (!p.get('bedrooms') || x.bedrooms >= Number(p.get('bedrooms'))) &&
      (!p.get('city') || x.city === p.get('city')) &&
      (sauf === 'location' || !p.get('location') || x.location === p.get('location')),
    );
  }
  function compter(biens: Bien[], cle: 'type' | 'location') {
    const parValeur = new Map<string, number>();
    for (const x of biens) parValeur.set(x[cle], (parValeur.get(x[cle]) ?? 0) + 1);
    return [...parValeur].map(([value, count]) => ({ value, count })).sort((a, z) => z.count - a.count);
  }
  return {
    total: (p: URLSearchParams) => liste(p).length,
    facettes: (p: URLSearchParams) => ({
      ...(p.get('facets') === 'type' ? { type: compter(liste(p, 'type'), 'type') } : {}),
      ...(p.get('facets') === 'neighborhood' ? { neighborhood: compter(liste(p, 'location'), 'location') } : {}),
    }),
    global: (cle: 'type' | 'location', valeur: string) => BIENS.filter((x) => x[cle] === valeur).length,
  };
});

vi.mock('@/lib/api', async (importActual) => {
  const reel = await importActual<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiRequest: vi.fn((chemin: string) => {
      api.chemins.push(chemin);
      const u = new URL(chemin, 'http://x');
      if (u.pathname === '/api/search/suggest') {
        const q = u.searchParams.get('q') ?? '';
        return api.suggestions.has(q) ? Promise.resolve(api.suggestions.get(q)) : new Promise(() => {});
      }
      const domaine = api.domaines.get(u.pathname);
      return domaine === undefined ? Promise.reject(new Error(`non doublé : ${chemin}`)) : Promise.resolve(domaine);
    }),
    apiFetch: vi.fn((chemin: string) => {
      const p = new URLSearchParams(chemin.split('?')[1] ?? '');
      if (p.has('facets')) {
        api.facettes.push(chemin);
        return Promise.resolve({
          data: [],
          meta: { total: catalogue.total(p), ...(api.servirLesFacettes ? { facets: catalogue.facettes(p) } : {}) },
        });
      }
      api.fetches.push(chemin);
      return Promise.resolve({ data: [], meta: { total: api.totalNouveaux } });
    }),
  };
});

vi.mock('@/components/favorites/SaveSearchDialog', () => ({
  SaveSearchDialog: () => <div role="dialog" aria-label="alerte" />,
}));

import { SearchAutocomplete, lieuxCorriges, RAYON_AUTOUR_DE_MOI_KM } from '../SearchAutocomplete';
import { requeteDesNouveaux } from '../donnees-de-l-ecran-de-recherche';

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

/** Mesuré sur la base de démonstration (TCK-2496) : « mermos » est lu « Mermoz », du 11e au 17e signe. */
const APPART_3CH_MERMOS = vide({
  interpretation: {
    criteria: { type: 'apartment', bedrooms: 3, city: 'Dakar', location: 'Mermoz' },
    parts: [
      { key: 'type', value: 'apartment', from: 0, to: 6 },
      { key: 'bedrooms', value: 3, from: 7, to: 10 },
      { key: 'location', value: 'Mermoz', from: 11, to: 17 },
    ],
    residue: null,
    count: 7,
  },
});

/** Rien ne correspond ; retirer « 5+ ch. » rend 4 biens, retirer le quartier en rend 12. */
const VILLA_YOFF_5CH = (relaxations?: { key: string; count: number }[]) =>
  vide({
    interpretation: {
      criteria: { type: 'villa', bedrooms: 5, city: 'Dakar', location: 'Yoff' },
      parts: [
        { key: 'type', value: 'villa', from: 0, to: 5 },
        { key: 'location', value: 'Yoff', from: 6, to: 10 },
        { key: 'bedrooms', value: 5, from: 11, to: 14 },
      ],
      residue: null,
      count: 0,
      widens: true,
      ...(relaxations ? { relaxations } : {}),
    },
  });

function monter(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="fr" messages={frMessages} timeZone="Africa/Dakar">{node}</NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const SOUS_LE_CHAMP = (
  <div data-testid="sous-le-champ">
    <button type="button">Louer</button>
    <button type="button">Rechercher</button>
  </div>
);

function ecran(props: Partial<React.ComponentProps<typeof SearchAutocomplete>> = {}) {
  return monter(<SearchAutocomplete surface="ecran" sousLeChamp={SOUS_LE_CHAMP} {...props} />);
}

function suggestionsDemandees(): URLSearchParams[] {
  return api.chemins
    .filter((c) => c.startsWith('/api/search/suggest'))
    .map((c) => new URL(c, 'http://x').searchParams);
}

function paramsDe(href: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(href.split('?')[1] ?? ''));
}

let geolocalisation: { getCurrentPosition: ReturnType<typeof vi.fn> } | undefined;

beforeEach(() => {
  push.mockReset();
  url.params = '';
  api.suggestions = new Map([['', vide()]]);
  api.domaines = new Map();
  api.chemins = [];
  api.fetches = [];
  api.facettes = [];
  api.totalNouveaux = 4;
  api.servirLesFacettes = true;
  window.localStorage.clear();
  geolocalisation = { getCurrentPosition: vi.fn() };
  Object.defineProperty(navigator, 'geolocation', { value: geolocalisation, configurable: true });
});

afterEach(() => {
  Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
});

describe('AC1 — la liste ne recouvre jamais Louer / Acheter ni « Rechercher »', () => {
  it('l’écran range la liste SOUS le champ et sous `sousLeChamp`, dans le flux, jamais par-dessus', async () => {
    ecran();
    const liste = screen.getByRole('listbox');
    const sous = screen.getByTestId('sous-le-champ');
    // Ouvert d'emblée : l'écran EST la saisie.
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'true');
    // Dans l'ordre du document : le champ, Louer / Acheter + « Rechercher », puis la liste.
    expect(sous.compareDocumentPosition(liste) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('combobox').compareDocumentPosition(sous) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // La liste n'est pas posée sur la page : ni elle ni un parent jusqu'au composant n'est en absolu.
    for (let n: HTMLElement | null = liste; n && n !== document.body; n = n.parentElement) {
      expect(n.className).not.toMatch(/(^|\s)(absolute|fixed)(\s|$)/);
    }
    // Elle défile seule, dans le reste de la hauteur.
    expect(liste.className).toMatch(/overflow-y-auto/);
    expect(liste.className).toMatch(/flex-1/);
  });

  it('pendant la frappe, « Voir les N biens » est la première ligne, sous Louer / Acheter', async () => {
    api.suggestions.set('appart 3ch mermos', APPART_3CH_MERMOS);
    ecran();
    await userEvent.type(screen.getByRole('combobox'), 'appart 3ch mermos');
    const premiere = await waitFor(() => {
      const o = within(screen.getByRole('listbox')).getAllByRole('option')[0]!;
      expect(o).toHaveTextContent('Voir les 7 biens');
      return o;
    });
    fireEvent.mouseDown(premiere);
    expect(paramsDe(push.mock.calls[0]![0])).toEqual({ location: 'Mermoz', city: 'Dakar', type: 'apartment', bedrooms: '3' });
  });

  it('le menu de toujours reste posé sur la page (témoin : la surface par défaut n’a pas changé)', async () => {
    monter(<SearchAutocomplete />);
    await userEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox').className).toMatch(/(^|\s)absolute(\s|$)/);
  });
});

describe('La partie corrigée : « mermos » lu « Mermoz »', () => {
  it('lieuxCorriges rend le mot TAPÉ (from/to) et l’orthographe de l’index', () => {
    expect(lieuxCorriges(APPART_3CH_MERMOS.data.interpretation!.parts, 'appart 3ch mermos')).toEqual([
      { tape: 'mermos', lu: 'Mermoz' },
    ]);
  });

  it('une simple différence de casse ou d’accent n’est pas une correction', () => {
    const parts = [{ key: 'location', value: 'Mermoz', from: 0, to: 6 }];
    expect(lieuxCorriges(parts, 'mermoz')).toEqual([]);
    expect(lieuxCorriges([{ key: 'city', value: 'Thiès', from: 0, to: 5 }], 'thies')).toEqual([]);
    // Seuls les lieux : un type tapé « appart » lu « apartment » n'est pas une faute.
    expect(lieuxCorriges([{ key: 'type', value: 'apartment', from: 0, to: 6 }], 'appart')).toEqual([]);
  });

  it('l’écran l’écrit sous la saisie comprise', async () => {
    api.suggestions.set('appart 3ch mermos', APPART_3CH_MERMOS);
    ecran();
    await userEvent.type(screen.getByRole('combobox'), 'appart 3ch mermos');
    expect(await screen.findByText('« mermos » lu Mermoz')).toBeInTheDocument();
  });
});

describe('Zéro bien : retirer un critère (TCK-2496), sinon l’alerte et les biens proches (AC4)', () => {
  it('chaque relaxation dit le critère et son compte, et ouvre la liste SANS lui', async () => {
    api.suggestions.set('villa yoff 5ch', VILLA_YOFF_5CH([
      { key: 'bedrooms', count: 4 },
      { key: 'location', count: 12 },
    ]));
    ecran();
    await userEvent.type(screen.getByRole('combobox'), 'villa yoff 5ch');
    expect(await screen.findByText('Retirer un critère')).toBeInTheDocument();
    const sansChambres = screen.getByRole('option', { name: /Sans 5\+ ch\..*4/ });
    const sansQuartier = screen.getByRole('option', { name: /Sans Quartier : Yoff.*12/ });

    fireEvent.mouseDown(sansChambres);
    expect(paramsDe(push.mock.calls[0]![0])).toEqual({ location: 'Yoff', city: 'Dakar', type: 'villa' });

    push.mockReset();
    fireEvent.mouseDown(sansQuartier);
    // Le quartier retiré, la ville qu'il impliquait reste.
    expect(paramsDe(push.mock.calls[0]![0])).toEqual({ city: 'Dakar', type: 'villa', bedrooms: '5' });
  });

  it('clé `relaxations` absente : l’alerte et « Voir des biens proches », et aucun bloc vide', async () => {
    api.suggestions.set('villa yoff 5ch', VILLA_YOFF_5CH());
    ecran();
    await userEvent.type(screen.getByRole('combobox'), 'villa yoff 5ch');
    expect(await screen.findByText(frMessages.search.ecran.noneTitle)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /M’alerter/ })).toBeInTheDocument();
    expect(screen.getByText('Voir des biens proches')).toBeInTheDocument();
    expect(screen.queryByText('Retirer un critère')).not.toBeInTheDocument();
    // Aucun groupe sans option.
    for (const groupe of within(screen.getByRole('listbox')).queryAllByRole('group')) {
      expect(within(groupe).queryAllByRole('option').length).toBeGreaterThan(0);
    }
  });

  it('un tableau vide vaut une clé absente', async () => {
    api.suggestions.set('villa yoff 5ch', VILLA_YOFF_5CH([]));
    ecran();
    await userEvent.type(screen.getByRole('combobox'), 'villa yoff 5ch');
    await screen.findByText(frMessages.search.ecran.noneTitle);
    expect(screen.queryByText('Retirer un critère')).not.toBeInTheDocument();
  });
});

describe('AC3 — depuis une liste filtrée, l’écran nomme les filtres gardés, et le compte est celui de la liste', () => {
  beforeEach(() => {
    url.params = 'contract_type=rent&type=villa&bedrooms=3&q=piscine';
  });

  it('il nomme les deux filtres (pas la transaction, pas le terme que la saisie remplace)', async () => {
    ecran();
    const option = await screen.findByRole('option', { name: /Vos filtres restent/ });
    // Exactement ces deux-là : la transaction (Louer / Acheter la montre) et le terme (la saisie le
    // remplace) n'y sont pas, quel que soit leur libellé.
    expect(option).toHaveTextContent(/^Vos filtres restent : Villa, 3\+ ch\.\s*Retirer$/);
  });

  it('la suggestion part AVEC eux : le compte annoncé est celui de la liste qui s’ouvrira', async () => {
    api.suggestions.set('mermoz', vide({
      interpretation: {
        criteria: { city: 'Dakar', location: 'Mermoz' },
        parts: [{ key: 'location', value: 'Mermoz', from: 0, to: 6 }],
        residue: null,
        count: 2,
      },
    }));
    ecran();
    await userEvent.type(screen.getByRole('combobox'), 'mermoz');
    await screen.findByText('Voir les 2 biens');
    const derniere = suggestionsDemandees().at(-1)!;
    expect(derniere.get('q')).toBe('mermoz');
    expect(derniere.get('type')).toBe('villa');
    expect(derniere.get('bedrooms')).toBe('3');

    fireEvent.mouseDown(screen.getByRole('option', { name: /Voir les 2 biens/ }));
    expect(paramsDe(push.mock.calls[0]![0])).toMatchObject({ type: 'villa', bedrooms: '3', location: 'Mermoz', city: 'Dakar' });
  });

  it('« Retirer » les ôte de la suggestion ET de la navigation, et le dit à l’hôte', async () => {
    const onRetrait = vi.fn();
    api.suggestions.set('mermoz', vide({
      interpretation: {
        criteria: { city: 'Dakar', location: 'Mermoz' },
        parts: [{ key: 'location', value: 'Mermoz', from: 0, to: 6 }],
        residue: null,
        count: 9,
      },
    }));
    ecran({ onRetraitDesFiltres: onRetrait });
    fireEvent.mouseDown(await screen.findByRole('option', { name: /Vos filtres restent/ }));
    expect(onRetrait).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('option', { name: /Vos filtres restent/ })).not.toBeInTheDocument();

    await userEvent.type(screen.getByRole('combobox'), 'mermoz');
    await screen.findByText('Voir les 9 biens');
    const derniere = suggestionsDemandees().at(-1)!;
    expect(derniere.get('type')).toBeNull();
    expect(derniere.get('bedrooms')).toBeNull();
    fireEvent.mouseDown(screen.getByRole('option', { name: /Voir les 9 biens/ }));
    expect(paramsDe(push.mock.calls[0]![0])).toEqual({ location: 'Mermoz', city: 'Dakar' });
  });
});

describe('Avant la frappe : autour de moi, récentes datées, quartiers et types', () => {
  it('« Autour de moi » ne demande la position QU’AU GESTE, puis ouvre la liste dans un rayon', async () => {
    url.params = 'contract_type=rent&city=Thiès&q=villa';
    ecran();
    const option = await screen.findByRole('option', { name: /Autour de moi/ });
    expect(geolocalisation!.getCurrentPosition).not.toHaveBeenCalled();

    fireEvent.mouseDown(option);
    expect(geolocalisation!.getCurrentPosition).toHaveBeenCalledTimes(1);
    const [succes] = geolocalisation!.getCurrentPosition.mock.calls[0]!;
    succes({ coords: { latitude: 14.7, longitude: -17.46 } });
    // Le point remplace le lieu et le terme ; la transaction reste.
    expect(paramsDe(push.mock.calls[0]![0])).toEqual({
      contract_type: 'rent',
      lat: '14.7',
      lng: '-17.46',
      radius_km: String(RAYON_AUTOUR_DE_MOI_KM),
    });
  });

  it('un refus se dit à l’écran, et la saisie reste ouverte', async () => {
    ecran();
    fireEvent.mouseDown(await screen.findByRole('option', { name: /Autour de moi/ }));
    const [, echec] = geolocalisation!.getCurrentPosition.mock.calls[0]!;
    echec({ code: 1 });
    expect(await screen.findByText(frMessages.search.ecran.aroundMe.denied)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('une récente datée dit combien de biens sont arrivés depuis, par la liste elle-même', async () => {
    window.localStorage.setItem(RECHERCHES_RECENTES_CLE, JSON.stringify([
      { texte: 'studio ngor', qs: 'type=studio&location=Ngor&city=Dakar' },
      { texte: 'terrain', qs: 'type=land' },
    ]));
    window.localStorage.setItem(RECHERCHES_RECENTES_VUES_CLE, JSON.stringify({
      'type=studio&location=Ngor&city=Dakar': '2026-11-01T08:00:00.000Z',
    }));
    ecran();
    expect(await screen.findByText('4 nouveaux biens depuis votre dernière visite')).toBeInTheDocument();
    // Une seule requête : la récente sans date n'invente pas de compte.
    expect(api.fetches).toHaveLength(1);
    const p = new URLSearchParams(api.fetches[0]!.split('?')[1]);
    expect(api.fetches[0]!.startsWith('/public/properties/search?')).toBe(true);
    expect(p.get('published_after')).toBe('2026-11-01T08:00:00.000Z');
    expect(p.get('per_page')).toBe('1');
    expect(p.get('placements')).toBe('false');
    expect(p.get('fields[properties]')).toBe('id');
    expect(p.get('type')).toBe('studio');
    expect(p.get('location')).toBe('Ngor');
  });

  it('zéro nouveau ne s’affiche pas', async () => {
    api.totalNouveaux = 0;
    window.localStorage.setItem(RECHERCHES_RECENTES_CLE, JSON.stringify([{ texte: 'terrain', qs: 'type=land' }]));
    window.localStorage.setItem(RECHERCHES_RECENTES_VUES_CLE, JSON.stringify({ 'type=land': '2026-11-01T08:00:00.000Z' }));
    ecran();
    await waitFor(() => expect(api.fetches).toHaveLength(1));
    await screen.findByRole('option', { name: /terrain/ });
    expect(screen.queryByText(/depuis votre dernière visite/)).not.toBeInTheDocument();
  });

  it('aucune facette servie : ni titre ni groupe, et JAMAIS un compte global à la place', async () => {
    api.servirLesFacettes = false;
    api.domaines.set('/api/public/properties/cities', { data: [{ value: 'Dakar', count: 190 }] });
    ecran();
    await waitFor(() => expect(api.facettes.length).toBeGreaterThanOrEqual(2));
    await screen.findByRole('option', { name: /Autour de moi/ });
    expect(screen.queryByText(/Quartiers populaires/)).not.toBeInTheDocument();
    expect(screen.queryByText('Type de bien')).not.toBeInTheDocument();
    // Les domaines globaux ne sont plus lus du tout.
    expect(api.chemins.some((c) => c.includes('/public/property-types') || c.includes('/public/properties/neighborhoods'))).toBe(false);
  });

  it('la ville de la liste en vigueur l’emporte, sans lire le catalogue des villes', async () => {
    url.params = 'city=Thiès';
    ecran();
    expect(await screen.findByText('Quartiers populaires · Thiès')).toBeInTheDocument();
    expect(api.chemins.some((c) => c.startsWith('/api/public/properties/cities'))).toBe(false);
  });
});

/**
 * Revue adverse de TCK-2497 — « Villa 28 » annoncé pour une liste de 15 : les pastilles comptaient le
 * catalogue entier. Le compte d'une pastille est le `meta.total` de la liste qu'elle OUVRE, sous la base
 * (filtres gardés + transaction imposée).
 */
describe('Revue — le compte d’une pastille est celui de la liste qu’elle ouvre, sous la base', () => {
  beforeEach(() => {
    // Deux filtres et une transaction posés ; la ville des quartiers vient du catalogue des villes.
    url.params = 'contract_type=rent&bedrooms=3&sort=-price&page=2';
    api.domaines.set('/api/public/properties/cities', { data: [{ value: 'Dakar', count: 190 }, { value: 'Thiès', count: 8 }] });
  });

  async function pastillesDe(titre: string): Promise<HTMLElement[]> {
    const groupe = (await screen.findByText(titre)).closest('[role="group"]') as HTMLElement;
    return within(groupe).getAllByRole('option');
  }

  function compteAffiche(pastille: HTMLElement): number {
    return Number(pastille.textContent!.match(/(\d+)\s*$/)![1]);
  }

  it('chaque pastille de type annonce le total de la liste qu’elle ouvre', async () => {
    ecran();
    const nombre = (await pastillesDe('Type de bien')).length;
    expect(nombre).toBeGreaterThanOrEqual(2);
    let unCompteGlobalDiffere = false;
    for (let i = 0; i < nombre; i++) {
      // Relue à chaque tour : un geste re-rend la liste.
      const pastille = (await pastillesDe('Type de bien'))[i]!;
      push.mockReset();
      fireEvent.mouseDown(pastille);
      const ouverte = new URLSearchParams(push.mock.calls[0]![0].split('?')[1]);
      expect(ouverte.get('contract_type')).toBe('rent');
      expect(ouverte.get('bedrooms')).toBe('3');
      expect(compteAffiche(pastille), pastille.textContent!).toBe(catalogue.total(ouverte));
      if (catalogue.global('type', ouverte.get('type')!) !== compteAffiche(pastille)) unCompteGlobalDiffere = true;
    }
    // Le catalogue est construit pour qu'un compte global se TROMPE : sans quoi le test ne garderait rien.
    expect(unCompteGlobalDiffere).toBe(true);
  });

  it('chaque pastille de quartier annonce le total de la liste qu’elle ouvre (ville comprise)', async () => {
    ecran();
    const nombre = (await pastillesDe('Quartiers populaires · Dakar')).length;
    expect(nombre).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < nombre; i++) {
      const pastille = (await pastillesDe('Quartiers populaires · Dakar'))[i]!;
      push.mockReset();
      fireEvent.mouseDown(pastille);
      const ouverte = new URLSearchParams(push.mock.calls[0]![0].split('?')[1]);
      expect(ouverte.get('city')).toBe('Dakar');
      expect(compteAffiche(pastille), pastille.textContent!).toBe(catalogue.total(ouverte));
    }
    // « HLM » existe aussi à Thiès : sans la ville dans la requête, son compte serait faux.
    expect(screen.queryByRole('option', { name: /Thiès/ })).not.toBeInTheDocument();
  });

  it('Louer imposé par l’écran (URL sans transaction) : la requête porte contract_type=rent, le compte est celui des locations', async () => {
    url.params = 'bedrooms=3';
    ecran({ imposer: { contract_type: 'rent' } });
    const nombre = (await pastillesDe('Type de bien')).length;
    expect(nombre).toBeGreaterThanOrEqual(2);
    expect(api.facettes.length).toBeGreaterThan(0);
    for (const chemin of api.facettes) {
      expect(new URLSearchParams(chemin.split('?')[1]).get('contract_type'), chemin).toBe('rent');
    }
    let laTransactionCompte = false;
    for (let i = 0; i < nombre; i++) {
      const pastille = (await pastillesDe('Type de bien'))[i]!;
      push.mockReset();
      fireEvent.mouseDown(pastille);
      const ouverte = new URLSearchParams(push.mock.calls[0]![0].split('?')[1]);
      expect(ouverte.get('contract_type')).toBe('rent');
      expect(compteAffiche(pastille), pastille.textContent!).toBe(catalogue.total(ouverte));
      const sansTransaction = new URLSearchParams(ouverte);
      sansTransaction.delete('contract_type');
      if (catalogue.total(sansTransaction) !== compteAffiche(pastille)) laTransactionCompte = true;
    }
    // Le catalogue compte des villas à vendre : sans la transaction imposée, un compte serait faux.
    expect(laTransactionCompte).toBe(true);
  });

  it('la requête de facette est maigre et sans emplacement', async () => {
    ecran();
    await pastillesDe('Type de bien');
    for (const chemin of api.facettes) {
      const p = new URLSearchParams(chemin.split('?')[1]);
      expect(chemin.startsWith('/public/properties/search?')).toBe(true);
      expect(p.get('per_page')).toBe('1');
      expect(p.get('fields[properties]')).toBe('id');
      expect(p.get('placements')).toBe('false');
      expect(p.get('page')).toBeNull();
    }
  });
});

describe('Le panneau de bureau', () => {
  it('champ vide : deux colonnes, et les aides clavier hors de la liste', async () => {
    window.localStorage.setItem(RECHERCHES_RECENTES_CLE, JSON.stringify([{ texte: 'terrain', qs: 'type=land' }]));
    monter(<SearchAutocomplete surface="panneau" />);
    await userEvent.click(screen.getByRole('combobox'));
    await screen.findByText('Type de bien');
    const liste = screen.getByRole('listbox');
    expect(liste.querySelector('.grid-cols-2, [class*="grid-cols-2"]')).not.toBeNull();
    const aides = screen.getByText((_, el) => el?.tagName === 'P' && /pour choisir.*pour ouvrir.*Échap.*pour fermer/.test(el.textContent ?? ''));
    expect(liste.contains(aides)).toBe(false);
    // L'ordre du clavier suit celui de l'écran : la colonne de gauche (récentes) avant les types.
    const libelles = within(liste).getAllByRole('option').map((o) => o.textContent ?? '');
    expect(libelles.findIndex((l) => l.includes('terrain'))).toBeLessThan(libelles.findIndex((l) => l.includes('Studio')));
  });
});

describe('requeteDesNouveaux', () => {
  it('garde les filtres de la récente, retire la page, et ne sert aucun emplacement', () => {
    const p = new URLSearchParams(requeteDesNouveaux('type=villa&page=3&sort=-price', '2026-11-01T08:00:00.000Z').split('?')[1]);
    expect(p.get('type')).toBe('villa');
    expect(p.get('page')).toBeNull();
    expect(p.get('per_page')).toBe('1');
    expect(p.get('placements')).toBe('false');
    expect(p.get('fields[properties]')).toBe('id');
    expect(p.get('published_after')).toBe('2026-11-01T08:00:00.000Z');
  });
});
