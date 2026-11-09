import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { clefDeRecherche, requeteAvecFixes } from '@/lib/recherche-publique';
import { parametresFixesDeFiche } from '@/lib/fiche-publique';
import type { SearchResult } from '@/types/search';

let parametres = new URLSearchParams();
const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, back: vi.fn() }),
  usePathname: () => '/fr/agencies/dakar-immo',
  useSearchParams: () => parametres,
}));

const apiFetchMock = vi.fn();
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

// La feuille de filtres (référentiel en React Query) a ses propres tests ; cartes et lignes aussi.
vi.mock('@/components/search/FilterSidebar', () => ({ FilterSidebar: () => null }));
vi.mock('@/components/property/PropertyCard', () => ({ PropertyCard: () => null }));
vi.mock('@/components/property/liste/LigneDeResultat', () => ({
  LigneDeResultat: ({ property }: { property: { title: string } }) => <li>{property.title}</li>,
}));

import { RechercheDuPortefeuille } from '../RechercheDuPortefeuille';

const FIXES = parametresFixesDeFiche({ agency: 'dakar-immo' });

/** La graine que le serveur aurait semée pour l'URL courante — même clef que le navigateur. */
function graine(resultat: Partial<SearchResult['meta']> & { data?: unknown[] }) {
  const { data = [], ...meta } = resultat;
  return {
    clef: clefDeRecherche(requeteAvecFixes(new URLSearchParams(parametres), FIXES)),
    resultat: {
      data,
      meta: { total: 0, current_page: 1, last_page: 1, per_page: 12, ...meta },
    } as unknown as SearchResult,
  };
}

// Relevé du 2026-11-09 sur Dakar Immo : `?contract_type=sale&type=garage` → 0 bien.
const FACETTES_GARAGE: SearchResult['meta']['facets'] = {
  contract_type: [{ value: 'rent', count: 2 }],
  type: [
    { value: 'villa', count: 5 },
    { value: 'land', count: 4 },
    { value: 'office', count: 3 },
    { value: 'room', count: 3 },
    { value: 'apartment', count: 2 },
    { value: 'shop', count: 2 },
    { value: 'house', count: 1 },
    { value: 'studio', count: 1 },
    { value: 'warehouse', count: 1 },
  ],
};

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  apiFetchMock.mockReset();
  parametres = new URLSearchParams();
});

describe('TCK-2522 · AC3 — « aucun bien » propose deux élargissements comptés par les facettes', () => {
  it('rend les deux élargissements, au compte des facettes, et « ailleurs » avec les mêmes critères', async () => {
    parametres = new URLSearchParams('contract_type=sale&type=garage');
    render(withIntl(<RechercheDuPortefeuille graine={graine({ total: 0, facets: FACETTES_GARAGE })} fixes={FIXES} total={68} nom="Dakar Immo" />));

    const vide = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-aucun-bien]');
      expect(el).not.toBeNull();
      return el!;
    });
    const transaction = vide.querySelector<HTMLElement>('[data-elargir="contract_type"]')!;
    const type = vide.querySelector<HTMLElement>('[data-elargir="type"]')!;
    expect(transaction).toHaveTextContent('2 biens');
    expect(type).toHaveTextContent('22 biens');
    expect(within(vide).getByRole('link', { name: /toutes agences/ })).toHaveAttribute('href', '/fr/properties?contract_type=sale&type=garage');
    // La graine suffit : aucune requête n'est repartie à l'hydratation.
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('élargir retire le seul filtre nommé, et garde les autres', async () => {
    parametres = new URLSearchParams('contract_type=sale&type=garage');
    render(withIntl(<RechercheDuPortefeuille graine={graine({ total: 0, facets: FACETTES_GARAGE })} fixes={FIXES} total={68} nom="Dakar Immo" />));

    await userEvent.click(await waitFor(() => document.querySelector<HTMLElement>('[data-elargir="type"]')!));

    await waitFor(() => expect(push).toHaveBeenCalled());
    const url = new URL(String(push.mock.calls.at(-1)?.[0]), 'http://x');
    expect(url.searchParams.get('contract_type')).toBe('sale');
    expect(url.searchParams.has('type')).toBe(false);
    // Le périmètre ne s'écrit jamais dans l'URL de la fiche.
    expect(url.searchParams.has('agency')).toBe(false);
    expect(url.searchParams.has('facets')).toBe(false);
  });

  it('sans élargissement qui rende un bien, seul « effacer » et « ailleurs » restent', async () => {
    parametres = new URLSearchParams('contract_type=sale&type=studio&bedrooms=3');
    render(withIntl(<RechercheDuPortefeuille graine={graine({ total: 0, facets: { contract_type: [], type: [] } })} fixes={FIXES} total={68} nom="Dakar Immo" />));

    const vide = await waitFor(() => document.querySelector<HTMLElement>('[data-aucun-bien]')!);
    expect(vide.querySelector('[data-elargir]')).toBeNull();
    expect(within(vide).getByRole('button', { name: 'Effacer les filtres' })).toBeInTheDocument();
  });
});

describe('TCK-2522 · AC1 — « N biens sur M »', () => {
  it('filtré : N de la recherche, M du portefeuille entier', async () => {
    parametres = new URLSearchParams('contract_type=rent&bedrooms=2&price_max=1000000');
    render(
      withIntl(
        <RechercheDuPortefeuille
          graine={graine({ total: 7, data: [{ id: 1, slug: 'a', title: 'Villa Luxe' }] })}
          fixes={FIXES}
          total={68}
          nom="Dakar Immo"
        />,
      ),
    );

    expect(await screen.findByText('7 biens')).toBeInTheDocument();
    expect(screen.getByText('sur 68')).toBeInTheDocument();
  });

  it('sans filtre, pas de « sur M » (N vaut M)', async () => {
    render(withIntl(<RechercheDuPortefeuille graine={graine({ total: 68, data: [{ id: 1, slug: 'a', title: 'Villa Luxe' }] })} fixes={FIXES} total={68} nom="Dakar Immo" />));

    expect(await screen.findByText('68 biens')).toBeInTheDocument();
    expect(screen.queryByText(/^sur /)).not.toBeInTheDocument();
  });

  it('un « sur M » inconnu (panne du total) ne s’invente pas', async () => {
    parametres = new URLSearchParams('contract_type=rent');
    render(withIntl(<RechercheDuPortefeuille graine={graine({ total: 7, data: [{ id: 1, slug: 'a', title: 'Villa Luxe' }] })} fixes={FIXES} total={null} nom="Dakar Immo" />));

    expect(await screen.findByText('7 biens')).toBeInTheDocument();
    expect(screen.queryByText(/^sur /)).not.toBeInTheDocument();
  });
});

describe('TCK-2523 — l’élargissement « chez son agence » d’une fiche de personne', () => {
  const FIXES_AGENT = parametresFixesDeFiche({ agent: 'awa-diop' });
  const graineAgent = () => ({
    clef: clefDeRecherche(requeteAvecFixes(new URLSearchParams(parametres), FIXES_AGENT)),
    resultat: { data: [], meta: { total: 0, current_page: 1, last_page: 1, per_page: 12, facets: FACETTES_GARAGE } } as unknown as SearchResult,
  });

  it('l’agence a des biens qui répondent : son lien d’abord, puis UN élargissement', async () => {
    parametres = new URLSearchParams('contract_type=sale&type=garage');
    apiFetchMock.mockResolvedValue({ data: [], meta: { total: 5 } });
    render(withIntl(<RechercheDuPortefeuille graine={graineAgent()} fixes={FIXES_AGENT} total={9} nom="Awa D." agence={{ nom: 'Dakar Immo', slug: 'dakar-immo' }} />));

    const lien = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-elargir="agence"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(lien).toHaveTextContent('5 biens');
    expect(lien).toHaveAttribute('href', '/fr/agencies/dakar-immo?contract_type=sale&type=garage');
    const requete = new URLSearchParams(String(apiFetchMock.mock.calls[0][0]).split('?')[1]);
    expect(requete.get('agency')).toBe('dakar-immo');
    expect(requete.get('type')).toBe('garage');
    expect(document.querySelectorAll('[data-elargir]:not([data-elargir="agence"])')).toHaveLength(1);
  });

  it('l’agence n’a rien non plus : pas de lien vers elle, et les DEUX élargissements restent', async () => {
    parametres = new URLSearchParams('contract_type=sale&type=garage');
    apiFetchMock.mockResolvedValue({ data: [], meta: { total: 0 } });
    render(withIntl(<RechercheDuPortefeuille graine={graineAgent()} fixes={FIXES_AGENT} total={9} nom="Awa D." agence={{ nom: 'Dakar Immo', slug: 'dakar-immo' }} />));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelectorAll('[data-elargir]')).toHaveLength(2));
    expect(document.querySelector('[data-elargir="agence"]')).toBeNull();
  });
});

/**
 * Revue du 2026-11-09 — « Voir N biens de plus » reste DANS le périmètre de la fiche : la clé de la
 * suite est celle de l'URL (sans `agency`) ; si la page 2 perdait les paramètres fixes, elle irait
 * chercher les biens de toutes les agences, et rien d'autre ne le dirait.
 */
describe('« Voir plus » garde le périmètre de la fiche', () => {
  it('la page 2 part avec `agency`, les filtres de l’URL et `page=2`', async () => {
    parametres = new URLSearchParams('contract_type=rent');
    const biens = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, title: `Bien ${i + 1}` }));
    apiFetchMock.mockResolvedValue({
      data: [{ id: 99, title: 'Bien 99' }],
      meta: { total: 13, current_page: 2, last_page: 2, per_page: 12 },
    });
    render(
      withIntl(
        <RechercheDuPortefeuille
          graine={graine({ total: 13, last_page: 2, data: biens })}
          fixes={FIXES}
          total={68}
          nom="Dakar Immo"
        />,
      ),
    );

    const lien = await waitFor(() => {
      const a = document.querySelector<HTMLAnchorElement>('[data-voir-plus] a');
      expect(a).not.toBeNull();
      return a!;
    });
    await userEvent.click(lien);

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    const url = new URL(String(apiFetchMock.mock.calls[0][0]), 'http://x');
    expect(url.pathname).toBe('/public/properties/search');
    expect(url.searchParams.get('agency')).toBe('dakar-immo');
    expect(url.searchParams.get('contract_type')).toBe('rent');
    expect(url.searchParams.get('page')).toBe('2');
    await screen.findByText('Bien 99');
  });
});

/**
 * Revue du 2026-11-09 — un geste de filtre n'écrit pas `page=1` dans l'URL de la fiche : c'est
 * l'adresse que « Partager » recopie, et la première page est la page par défaut.
 */
describe('l’URL de la fiche ne porte jamais `page=1`', () => {
  it('une pastille de transaction (recherche neuve)', async () => {
    render(withIntl(<RechercheDuPortefeuille graine={graine({ total: 3, data: [{ id: 1, title: 'A' }] })} fixes={FIXES} total={68} nom="Dakar Immo" />));
    await userEvent.click(screen.getByRole('button', { name: /^À louer/ }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    const url = new URL(String(push.mock.calls.at(-1)?.[0]), 'http://x');
    expect(url.searchParams.get('contract_type')).toBe('rent');
    expect(url.searchParams.has('page')).toBe(false);
  });

  it('un élargissement (retrait d’un filtre)', async () => {
    parametres = new URLSearchParams('contract_type=sale&type=garage&page=2');
    render(withIntl(<RechercheDuPortefeuille graine={graine({ total: 0, facets: FACETTES_GARAGE })} fixes={FIXES} total={68} nom="Dakar Immo" />));
    await userEvent.click(await waitFor(() => document.querySelector<HTMLElement>('[data-elargir="type"]')!));
    await waitFor(() => expect(push).toHaveBeenCalled());
    const url = new URL(String(push.mock.calls.at(-1)?.[0]), 'http://x');
    expect(url.searchParams.get('contract_type')).toBe('sale');
    expect(url.searchParams.has('page')).toBe(false);
  });

  it('le retrait d’une puce de filtre posé', async () => {
    parametres = new URLSearchParams('contract_type=rent&bedrooms=2&page=2');
    render(withIntl(<RechercheDuPortefeuille graine={graine({ total: 3, data: [{ id: 1, title: 'A' }] })} fixes={FIXES} total={68} nom="Dakar Immo" />));
    const puces = await waitFor(() => document.querySelector<HTMLElement>('[data-rangee="puces"]')!);
    const chambres = [...puces.querySelectorAll('button')].find((b) => /2/.test(b.textContent ?? '') && !/louer/i.test(b.textContent ?? ''))!;
    await userEvent.click(chambres);
    await waitFor(() => expect(push).toHaveBeenCalled());
    const url = new URL(String(push.mock.calls.at(-1)?.[0]), 'http://x');
    expect(url.searchParams.get('contract_type')).toBe('rent');
    expect(url.searchParams.has('bedrooms')).toBe(false);
    expect(url.searchParams.has('page')).toBe(false);
  });
});

/**
 * Revue du 2026-11-09 — la recherche (champ, pastilles, puces) COLLE au téléphone, comme la
 * maquette D : sous les onglets de la fiche d'agence (49 px), sous la rangée de la fiche de personne
 * (56 px). En bureau, elle reste dans le flux.
 */
describe('la recherche colle au téléphone', () => {
  const collante = () => document.querySelector<HTMLElement>('[data-recherche-collante]')!;

  it('sous les onglets : `sticky top-[49px]`, le champ et les pastilles dedans, statique en bureau', () => {
    render(withIntl(<RechercheDuPortefeuille graine={graine({ total: 3, data: [{ id: 1, title: 'A' }] })} fixes={FIXES} total={68} nom="Dakar Immo" collerSous="onglets" />));
    const bloc = collante();
    // `z-20` : au-dessus du favori des lignes (`absolute z-10`), qui passait sinon par-dessus le champ.
    expect(bloc.className.split(/\s+/)).toEqual(expect.arrayContaining(['sticky', 'top-[49px]', 'z-20', 'bg-background', 'lg:static']));
    expect(bloc.querySelector('form[role="search"]')).not.toBeNull();
    expect(within(bloc).getByRole('button', { name: /^À louer/ })).toBeInTheDocument();
  });

  it('sous la rangée de la fiche de personne : `top-14`', () => {
    render(withIntl(<RechercheDuPortefeuille graine={graine({ total: 3, data: [{ id: 1, title: 'A' }] })} fixes={FIXES} total={68} nom="Sokhna G." collerSous="en-tete" />));
    const classes = collante().className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(['sticky', 'top-14']));
    expect(classes).not.toContain('top-[49px]');
  });
});
