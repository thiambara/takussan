/**
 * TCK-2638 — `/app/properties` en deux modes. Le mode se lit dans l'URL, sinon dans la mémoire de
 * l'appareil, sinon c'est « Gestion » ; en Gestion, la liste porte l'occupation et les comptes
 * viennent d'UN appel `portfolio-summary`, sans aucune liste `per_page=1` (AC3).
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

const apiRequest = vi.fn();
const memoire = vi.hoisted(() => ({ mode: undefined as string | undefined }));
const utilisateur = vi.hoisted(() => ({ roles: ['agent'] as string[] }));
const recus = vi.hoisted(() => ({ avertissement: [] as unknown[], tuiles: [] as unknown[], liste: [] as unknown[], filtres: [] as unknown[] }));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({
  getMeAction: async () => ({ id: 7, first_name: 'Awa', last_name: 'Diop', roles: utilisateur.roles, phone_verified_at: null }),
}));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/biens/mode-memorise', () => ({ modeMemoriseDesBiens: async () => memoire.mode }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...a: unknown[]) => apiRequest(...a),
}));
vi.mock('@/components/property-dashboard/PropertyList', () => ({
  PropertyList: (props: unknown) => {
    recus.liste.push(props);
    return null;
  },
}));
vi.mock('@/components/property-dashboard/PropertyListFilters', () => ({
  PropertyListFilters: (props: unknown) => {
    recus.filtres.push(props);
    return null;
  },
}));
vi.mock('@/components/property-dashboard/PropertyPagination', () => ({ PropertyPagination: () => null }));
vi.mock('@/components/property-dashboard/ModesDeLaListe', () => ({
  SelecteurDeMode: ({ mode }: { mode: string }) => <p data-testid="mode">{mode}</p>,
  PastillesGestion: () => null,
  TuilesGestion: (props: unknown) => {
    recus.tuiles.push(props);
    return null;
  },
}));
vi.mock('@/components/contact/AvertissementNumeroNonVerifie', () => ({
  AvertissementNumeroNonVerifie: (props: unknown) => {
    recus.avertissement.push(props);
    return null;
  },
}));

import Page from '../page';

const RESUME = {
  total: 84,
  occupied: 61,
  vacant: 9,
  for_sale: 0,
  vacant_over_60_days: 2,
  notice: 3,
  rent_late: 6,
  rent_late_amount: 4_210_000,
  online: 67,
};

const urls = () => apiRequest.mock.calls.map(([chemin]) => decodeURIComponent(String(chemin)));
const listes = () => urls().filter((u) => u.startsWith('/api/properties?'));
const resumes = () => urls().filter((u) => u.startsWith('/api/properties/portfolio-summary'));
const comptes = () => urls().filter((u) => /[?&]per_page=1(&|$)/.test(u));

let derniere = 1;

beforeEach(() => {
  memoire.mode = undefined;
  utilisateur.roles = ['agent'];
  derniere = 1;
  recus.avertissement = [];
  recus.tuiles = [];
  recus.liste = [];
  recus.filtres = [];
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (chemin: string) => {
    const u = decodeURIComponent(chemin);
    if (u.startsWith('/api/properties/portfolio-summary')) return { data: RESUME };
    const page = Number(/[?&]page=(\d+)/.exec(u)?.[1] ?? '1');
    return {
      data: page > derniere ? [] : [{ id: 1, title: 'Appartement F3' }],
      meta: { current_page: page, last_page: derniere, per_page: 20, total: derniere * 20 },
    };
  });
});

const rendre = async (searchParams: Record<string, string> = {}) =>
  render(withIntl(await Page({ searchParams: Promise.resolve(searchParams) })));

describe('/app/properties — le mode (TCK-2638)', () => {
  it('sans URL ni mémoire : « Gestion »', async () => {
    await rendre();
    expect(screen.getByTestId('mode').textContent).toBe('gestion');
  });

  it('la mémoire de l’appareil reprend le mode', async () => {
    memoire.mode = 'annonces';
    await rendre();
    expect(screen.getByTestId('mode').textContent).toBe('annonces');
  });

  it('l’URL prime sur la mémoire (un lien garde le mode)', async () => {
    memoire.mode = 'annonces';
    await rendre({ mode: 'gestion' });
    expect(screen.getByTestId('mode').textContent).toBe('gestion');
  });
});

describe('/app/properties — mode Gestion (TCK-2638)', () => {
  it('AC3 : la liste porte l’occupation, et les comptes viennent d’UN appel portfolio-summary, sans aucun per_page=1', async () => {
    await rendre({ mode: 'gestion' });

    expect(listes()).toHaveLength(1);
    expect(listes()[0]).toContain('include=address,owner,collaborators,occupancy,online');
    expect(resumes()).toHaveLength(1);
    expect(comptes()).toHaveLength(0);
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });

  it('les tuiles et l’avertissement de numéro lisent le résumé (« en ligne » au sens du catalogue)', async () => {
    await rendre({ mode: 'gestion' });

    expect(recus.tuiles.at(-1)).toMatchObject({ resume: RESUME });
    expect(recus.avertissement.at(-1)).toMatchObject({ annoncesEnLigne: 67 });
    expect(recus.liste.at(-1)).toMatchObject({ presentation: 'gestion' });
    expect(recus.filtres.at(-1)).toMatchObject({ mode: 'gestion' });
  });

  it('le résumé garde la portée de la liste : « Mes biens » et les archives', async () => {
    await rendre({ mode: 'gestion', only_mine: '1', include_archived: '1', search: 'Mermoz' });

    expect(resumes()[0]).toContain('filter[user_id]=7');
    expect(resumes()[0]).toContain('include_archived=1');
    expect(resumes()[0]).not.toContain('Mermoz');
  });

  it('les pastilles filtrent la liste par occupation et retard ; une valeur inconnue est ignorée', async () => {
    await rendre({ mode: 'gestion', occupancy: 'vacant', search: 'Mermoz' });
    expect(listes()[0]).toContain('filter[occupancy]=vacant');
    expect(listes()[0]).toContain('filter[search]=Mermoz');

    apiRequest.mockClear();
    await rendre({ mode: 'gestion', rent_late: '1', occupancy: 'demoli' });
    expect(listes()[0]).toContain('filter[rent_late]=1');
    expect(listes()[0]).not.toContain('filter[occupancy]');
  });

  it('TCK-2638 : la tuile « À vendre » (occupancy=not_rental) filtre la liste — sans elle, le paramètre serait écarté', async () => {
    await rendre({ mode: 'gestion', occupancy: 'not_rental' });
    expect(listes()[0]).toContain('filter[occupancy]=not_rental');
  });

  it('« Retards d’abord » (sort=retard) part en Gestion, jamais en Annonces', async () => {
    await rendre({ mode: 'gestion', sort: 'retard' });
    expect(listes()[0]).toContain('sort=retard');

    apiRequest.mockClear();
    await rendre({ mode: 'annonces', sort: 'retard', occupancy: 'vacant' });
    expect(listes()[0]).not.toContain('sort=retard');
    // Les pastilles de Gestion restent dans l'URL (on les retrouve en revenant) sans filtrer les annonces.
    expect(listes()[0]).not.toContain('filter[occupancy]');
  });

  it('une page au-delà de la dernière (changement de mode ou de pastille) se relit à la dernière', async () => {
    derniere = 2;
    await rendre({ mode: 'gestion', page: '5' });

    expect(listes()).toHaveLength(2);
    expect(listes()[1]).toContain('page=2');
    expect(recus.liste.at(-1)).toMatchObject({ page: { meta: { current_page: 2 } } });
  });
});

describe('/app/properties — le titre (TCK-2638)', () => {
  it('« Biens » pour l’agence', async () => {
    await rendre();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Biens');
  });

  it('« Mes biens » pour le bailleur', async () => {
    utilisateur.roles = ['owner', 'customer'];
    await rendre();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Mes biens');
  });
});
