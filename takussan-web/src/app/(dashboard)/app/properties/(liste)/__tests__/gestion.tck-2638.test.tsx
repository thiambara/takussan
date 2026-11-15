/**
 * TCK-2638 — `/app/properties` en deux modes. Le mode se lit dans l'URL, sinon dans la mémoire de
 * l'appareil, sinon c'est « Gestion » ; dans les deux, les comptes viennent d'UN appel
 * `portfolio-summary`, sans aucune liste `per_page=1` (AC3). Lot B : le mode Annonces, le quota, le
 * sélecteur caché sans bien à louer (décision 4 a), « Afficher les 20 suivants » et le libellé du bailleur.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type React from 'react';

import { withIntl } from '@/test/intl';

const apiRequest = vi.fn();
const memoire = vi.hoisted(() => ({ mode: undefined as string | undefined }));
const utilisateur = vi.hoisted(() => ({ roles: ['agent'] as string[] }));
const recus = vi.hoisted(() => ({
  avertissement: [] as unknown[],
  tuiles: [] as unknown[],
  liste: [] as unknown[],
  filtres: [] as unknown[],
  pastillesAnnonces: [] as unknown[],
  onglets: [] as unknown[],
  jauges: [] as { presentation: string; used: number; limit: number }[],
  suivants: [] as unknown[],
  pagination: [] as unknown[],
}));
const quota = vi.hoisted(() => ({ valeur: { used: 120, limit: 100 as number | null, can_create: false }, appels: 0 }));

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
  // TCK-2638 (lot B2) — la barre ENVELOPPE la liste et sa pagination : le double les rend en place.
  PropertyListFilters: (props: { sousLaBarre?: React.ReactNode; children?: React.ReactNode; pied?: React.ReactNode }) => {
    recus.filtres.push(props);
    return (
      <>
        {props.sousLaBarre}
        {props.children}
        {props.pied}
      </>
    );
  },
}));
vi.mock('@/components/property-dashboard/PropertyPagination', () => ({
  PropertyPagination: (props: unknown) => {
    recus.pagination.push(props);
    return null;
  },
}));
vi.mock('@/components/property-dashboard/ModesDeLaListe', () => ({
  SelecteurDeMode: ({ mode }: { mode: string }) => <p data-testid="mode">{mode}</p>,
  PastillesGestion: () => null,
  TuilesGestion: (props: unknown) => {
    recus.tuiles.push(props);
    return null;
  },
  PastillesAnnonces: (props: unknown) => {
    recus.pastillesAnnonces.push(props);
    return null;
  },
  OngletsAnnonces: (props: unknown) => {
    recus.onglets.push(props);
    return null;
  },
  JaugeDuQuota: (props: { presentation: string; used: number; limit: number }) => {
    recus.jauges.push(props);
    return null;
  },
  AfficherLesSuivants: (props: unknown) => {
    recus.suivants.push(props);
    return null;
  },
}));
vi.mock('@/app/actions/dashboard-properties', () => ({
  fetchListingQuotaAction: async () => {
    quota.appels += 1;
    return quota.valeur;
  },
}));
// L'action d'en-tête du téléphone (le « + » de la coque) est rendue en place, pour lire son libellé.
vi.mock('@/components/layout/en-tete-de-la-coque', () => ({
  DeclarerEnTete: ({ action }: { action?: React.ReactNode }) => <div data-testid="en-tete-de-la-coque">{action}</div>,
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
  pending_validation: 2,
  drafts: 5,
  offline: 10,
  sold_or_rented: 8,
  archived: 3,
};

/** Un portefeuille sans bien à louer (que des ventes) : ni occupé, ni vacant. */
const RESUME_SANS_LOCATION = { ...RESUME, total: 12, occupied: 0, vacant: 0, for_sale: 12 };
let resume: typeof RESUME = RESUME;

const urls = () => apiRequest.mock.calls.map(([chemin]) => decodeURIComponent(String(chemin)));
const listes = () => urls().filter((u) => u.startsWith('/api/properties?'));
const resumes = () => urls().filter((u) => u.startsWith('/api/properties/portfolio-summary'));
const comptes = () => urls().filter((u) => /[?&]per_page=1(&|$)/.test(u));

let derniere = 1;

beforeEach(() => {
  memoire.mode = undefined;
  utilisateur.roles = ['agent'];
  derniere = 1;
  resume = RESUME;
  quota.valeur = { used: 120, limit: 100, can_create: false };
  quota.appels = 0;
  for (const cle of Object.keys(recus) as (keyof typeof recus)[]) recus[cle] = [];
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (chemin: string) => {
    const u = decodeURIComponent(chemin);
    if (u.startsWith('/api/properties/portfolio-summary')) return { data: resume };
    const page = Number(/[?&]page=(\d+)/.exec(u)?.[1] ?? '1');
    const parPage = Number(/[?&]per_page=(\d+)/.exec(u)?.[1] ?? '20');
    return {
      data: page > derniere ? [] : [{ id: 1, title: 'Appartement F3' }],
      meta: { current_page: page, last_page: derniere, per_page: parPage, total: derniere * 20 + 30 },
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
    // Le quota est celui du mode Annonces seul : il est lu (une fois), mais la Gestion n'en montre rien.
    expect(recus.jauges).toHaveLength(0);
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

  it('TCK-2638 (lot B2) — « Retards d’abord » est le défaut de la Gestion, posé par le SERVEUR ; jamais en Annonces, jamais pendant une recherche', async () => {
    await rendre({ mode: 'gestion' });
    expect(listes()[0]).toContain('sort=retard');

    apiRequest.mockClear();
    await rendre({ mode: 'gestion', sort: 'price' });
    expect(listes()[0]).toContain('sort=price');
    expect(listes()[0]).not.toContain('sort=retard');

    // Pendant une recherche, aucun défaut : l'API classe par pertinence (TCK-662).
    apiRequest.mockClear();
    await rendre({ mode: 'gestion', search: 'Mermoz' });
    expect(listes()[0]).not.toContain('sort=');

    apiRequest.mockClear();
    await rendre({ mode: 'annonces' });
    expect(listes()[0]).toContain('sort=-created_at');
  });

  it('TCK-2638 (lot B2) — la barre reçoit le mode, le résumé (occupation du panneau) et le total (« N biens ») ; elle enveloppe la liste et sa pagination', async () => {
    await rendre({ mode: 'gestion' });
    expect(recus.filtres.at(-1)).toMatchObject({ mode: 'gestion', resume: RESUME, total: expect.any(Number) });
    expect(recus.liste.at(-1)).toMatchObject({ presentation: 'gestion' });
    expect(recus.pagination).not.toHaveLength(0);

    recus.filtres = [];
    await rendre({ mode: 'annonces' });
    expect((recus.filtres.at(-1) as { mode?: string }).mode).toBeUndefined();
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

describe('/app/properties — mode Annonces (TCK-2638, lot B)', () => {
  it('AC3 : la liste porte `is_online` (pas l’occupation), les comptes viennent d’UN résumé, aucun per_page=1', async () => {
    await rendre({ mode: 'annonces' });

    expect(listes()).toHaveLength(1);
    expect(listes()[0]).toContain('include=address,owner,collaborators,online');
    expect(listes()[0]).not.toContain('occupancy');
    expect(resumes()).toHaveLength(1);
    expect(comptes()).toHaveLength(0);
    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(recus.liste.at(-1)).toMatchObject({ presentation: 'annonces' });
    expect(recus.filtres.at(-1)).not.toMatchObject({ mode: 'gestion' });
  });

  it('les pastilles, les onglets et l’avertissement lisent le même résumé (`online`, ADR-0097)', async () => {
    await rendre({ mode: 'annonces' });

    expect(recus.pastillesAnnonces.at(-1)).toMatchObject({ resume: RESUME });
    expect(recus.onglets.at(-1)).toMatchObject({ resume: RESUME });
    expect(recus.avertissement.at(-1)).toMatchObject({ annoncesEnLigne: 67 });
    expect(recus.tuiles).toHaveLength(0);
  });

  it('une pastille filtre par `filter[listing]` ; une valeur inconnue est ignorée ; les pastilles de Gestion ne filtrent pas', async () => {
    await rendre({ mode: 'annonces', listing: 'pending', search: 'Mermoz', occupancy: 'vacant' });
    expect(listes()[0]).toContain('filter[listing]=pending');
    expect(listes()[0]).toContain('filter[search]=Mermoz');
    expect(listes()[0]).not.toContain('filter[occupancy]');

    apiRequest.mockClear();
    await rendre({ mode: 'annonces', listing: 'publie' });
    expect(listes()[0]).not.toContain('filter[listing]');

    // Et l'inverse : `listing` reste dans l'URL en Gestion, sans filtrer la liste.
    apiRequest.mockClear();
    await rendre({ mode: 'gestion', listing: 'online' });
    expect(listes()[0]).not.toContain('filter[listing]');
  });

  it('l’onglet « Archivés » inclut les archives, dans la liste ET dans le résumé', async () => {
    await rendre({ mode: 'annonces', status: 'archived', include_archived: '1' });
    expect(listes()[0]).toContain('filter[status]=archived');
    expect(listes()[0]).toContain('include_archived=1');
    expect(resumes()[0]).toContain('include_archived=1');
  });

  it('le quota de l’agence : en jauge au bureau et en bas de liste au téléphone', async () => {
    await rendre({ mode: 'annonces' });

    expect(quota.appels).toBe(1);
    expect(recus.jauges.map((j) => j.presentation).sort()).toEqual(['bureau', 'telephone']);
    expect(recus.jauges[0]).toMatchObject({ used: 120, limit: 100 });
  });

  it('pas de jauge pour un quota illimité', async () => {
    quota.valeur = { used: 4, limit: null, can_create: true };
    await rendre({ mode: 'annonces' });
    expect(recus.jauges).toHaveLength(0);
  });

  it('le bailleur ne consomme pas de quota : il n’est ni lu, ni montré', async () => {
    utilisateur.roles = ['owner', 'customer'];
    await rendre({ mode: 'annonces' });
    expect(quota.appels).toBe(0);
    expect(recus.jauges).toHaveLength(0);
  });
});

describe('/app/properties — le sélecteur et un compte sans bien à louer (TCK-2638, décision 4 a)', () => {
  it('avec des biens à louer, le sélecteur est proposé', async () => {
    await rendre({ mode: 'annonces' });
    expect(screen.getByTestId('mode').textContent).toBe('annonces');
  });

  it('sans bien à louer : ni sélecteur, et la liste est celle des annonces — même si l’URL demande la Gestion', async () => {
    resume = RESUME_SANS_LOCATION;
    await rendre({ mode: 'gestion', sort: 'retard' });

    expect(screen.queryByTestId('mode')).toBeNull();
    expect(recus.liste.at(-1)).toMatchObject({ presentation: 'annonces' });
    // La liste servie est celle des annonces : relue sans l'occupation ni « Retards d'abord ».
    expect(listes().at(-1)).not.toContain('occupancy');
    expect(listes().at(-1)).not.toContain('sort=retard');
    expect(recus.liste.at(-1)).toMatchObject({ page: { data: [{ id: 1 }] } });
  });

  it('sans bien à louer et en Annonces : une seule liste', async () => {
    resume = RESUME_SANS_LOCATION;
    memoire.mode = 'annonces';
    await rendre();
    expect(listes()).toHaveLength(1);
    expect(screen.queryByTestId('mode')).toBeNull();
  });

  it('sous « Mes biens », le sélecteur reste : le résumé ne compte que la portée, pas le compte', async () => {
    resume = RESUME_SANS_LOCATION;
    await rendre({ mode: 'gestion', only_mine: '1' });
    expect(screen.getByTestId('mode').textContent).toBe('gestion');
    expect(recus.liste.at(-1)).toMatchObject({ presentation: 'gestion' });
  });
});

describe('/app/properties — « Afficher les 20 suivants » au téléphone (TCK-2638)', () => {
  it('`voir=40` lit 40 biens sur la première page, quel que soit `page`', async () => {
    await rendre({ mode: 'annonces', voir: '40', page: '3', per_page: '10' });
    expect(listes()[0]).toContain('per_page=40');
    expect(listes()[0]).toContain('page=1');
  });

  it('une valeur hors de la règle (pas un multiple de 20, au-delà de 100) est ignorée', async () => {
    await rendre({ mode: 'gestion', voir: '35' });
    expect(listes()[0]).toContain('per_page=20');
    apiRequest.mockClear();
    await rendre({ mode: 'gestion', voir: '120' });
    expect(listes()[0]).toContain('per_page=20');
  });

  it('les deux modes proposent « les 20 suivants » tant qu’il en reste ; la pagination du bureau reste', async () => {
    for (const mode of ['gestion', 'annonces']) {
      for (const cle of Object.keys(recus) as (keyof typeof recus)[]) recus[cle] = [];
      await rendre({ mode });
      expect(recus.suivants).toHaveLength(1);
      expect(recus.pagination).toHaveLength(1);
    }
  });

  it('sur une page au-delà de la première, la pagination seule', async () => {
    derniere = 3;
    await rendre({ mode: 'annonces', page: '2' });
    expect(recus.suivants).toHaveLength(0);
    expect(recus.pagination).toHaveLength(1);
  });
});

describe('/app/properties — le geste de création du bailleur (TCK-2638)', () => {
  it('« Proposer un bien à mon agence », dans l’en-tête de la page comme dans celui du téléphone', async () => {
    utilisateur.roles = ['owner', 'customer'];
    await rendre();
    const liens = screen.getAllByRole('link', { name: /Proposer un bien à mon agence/ });
    expect(liens).toHaveLength(2);
    expect(screen.queryByRole('link', { name: /Publier un bien/ })).toBeNull();
  });

  it('« Publier un bien » pour l’agence', async () => {
    await rendre();
    expect(screen.getAllByRole('link', { name: /Publier un bien/ })).toHaveLength(2);
  });

  it('la bascule « Mes biens » n’est pas proposée au bailleur, dans les deux modes', async () => {
    utilisateur.roles = ['owner', 'customer'];
    await rendre({ mode: 'gestion' });
    await rendre({ mode: 'annonces' });
    expect(recus.filtres.map((f) => (f as { basculeMesBiens: boolean }).basculeMesBiens)).toEqual([false, false]);

    utilisateur.roles = ['agent'];
    recus.filtres = [];
    await rendre({ mode: 'annonces' });
    expect(recus.filtres.at(-1)).toMatchObject({ basculeMesBiens: true });
  });
});
