import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAbilities } from '@/lib/platform-abilities';
import { avecGestes } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import type { RadarAdvertiserRow } from '@/types/radar';
import { RadarAdvertiserList } from '../RadarAdvertiserList';

const VIEWER: PlatformAbilities = {
  level: 'viewer',
  abilities: ['platform.console.access', 'platform.reports.view'],
};

function ligne(id: number, partiel: Partial<RadarAdvertiserRow> = {}): RadarAdvertiserRow {
  return {
    id,
    phone: '+221771234567',
    display_name: 'Moussa Immo',
    nature: 'probable_intermediary',
    do_not_contact_at: null,
    claim: null,
    counts: { reviewed: 2, contacted: 1, consented: 0 },
    follow_up: null,
    ...partiel,
  };
}

const page = (lignes: RadarAdvertiserRow[]) => ({
  data: lignes,
  meta: { total: lignes.length, per_page: 25, current_page: 1, last_page: 1 },
});

/** Le `fetch` du navigateur : une réponse par file, lue sur `filter[queue]`. */
let parFile: Record<string, RadarAdvertiserRow[]>;
let fetchMock: ReturnType<typeof vi.fn>;

const urls = () => fetchMock.mock.calls.map(([url]) => new URL(String(url), 'http://localhost'));

function rendre(gestes?: PlatformAbilities) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      {avecGestes(<RadarAdvertiserList />, gestes)}
    </QueryClientProvider>,
  ));
  return userEvent.setup();
}

beforeEach(() => {
  parFile = { to_contact: [], awaiting: [], follow_up: [] };
  fetchMock = vi.fn(async (url: string) => {
    const file = new URL(String(url), 'http://localhost').searchParams.get('filter[queue]') ?? '';
    return new Response(JSON.stringify(page(parFile[file] ?? [])), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('Les files d’annonceurs (TCK-2388)', () => {
  it('s’ouvre sur « À contacter » ; « À relancer » demande filter[queue]=follow_up avec un sparse fieldset', async () => {
    const utilisateur = rendre();
    await screen.findByTestId('radar-annonceurs-vide');
    expect(urls()).toHaveLength(1);
    expect(urls()[0].searchParams.get('filter[queue]')).toBe('to_contact');

    await utilisateur.click(screen.getByRole('tab', { name: 'À relancer' }));

    await waitFor(() => expect(urls().some((u) => u.searchParams.get('filter[queue]') === 'follow_up')).toBe(true));
    const relance = urls().find((u) => u.searchParams.get('filter[queue]') === 'follow_up')!;
    expect(relance.searchParams.get('fields[radar_advertisers]')).toBe('id,phone,display_name,nature,do_not_contact_at');
    expect(relance.pathname).toBe('/api/super-admin/radar/advertisers');
    expect(relance.searchParams.get('per_page')).toBe('25');
  });

  it('un onglet qu’on ne regarde pas ne fait aucune requête', async () => {
    rendre();
    await screen.findByTestId('radar-annonceurs-vide');
    expect(urls().map((u) => u.searchParams.get('filter[queue]'))).toEqual(['to_contact']);
  });

  it('une ligne : nom, numéro, nature, comptes par étape ; le nom mène à la fiche', async () => {
    parFile.to_contact = [ligne(7)];
    rendre();
    const rangee = await screen.findByTestId('radar-annonceur-7');

    expect(within(rangee).getByRole('link', { name: 'Moussa Immo' })).toHaveAttribute('href', '/super-admin/radar/advertisers/7');
    expect(within(rangee).getByText('+221771234567')).toBeInTheDocument();
    expect(within(rangee).getByText('Intermédiaire probable')).toBeInTheDocument();
    expect(within(rangee).getByText(/À contacter :/).textContent).toMatch(/2/);
    expect(within(rangee).getByText(/Contactées :/).textContent).toMatch(/1/);
    expect(within(rangee).getByText(/Accord :/).textContent).toMatch(/0/);
  });

  it('l’échéance de relance est la date de l’API (due_at), et « sans réponse » se signale', async () => {
    parFile.follow_up = [
      ligne(8, { follow_up: { outreach_id: 3, sent_at: '2026-10-01T10:00:00+00:00', due_at: '2026-10-15T10:00:00+00:00', rank: 0, propose_no_answer: false } }),
      ligne(9, { follow_up: { outreach_id: 4, sent_at: '2026-09-01T10:00:00+00:00', due_at: '2026-09-22T10:00:00+00:00', rank: 2, propose_no_answer: true } }),
    ];
    const utilisateur = rendre();
    await utilisateur.click(await screen.findByRole('tab', { name: 'À relancer' }));

    const huit = await screen.findByTestId('radar-annonceur-8');
    expect(huit.textContent).toMatch(/15\/10\/2026|15 oct/i);
    expect(within(huit).queryByText(/Proposer « sans réponse »/)).not.toBeInTheDocument();
    const neuf = screen.getByTestId('radar-annonceur-9');
    expect(neuf.textContent).toMatch(/22\/09\/2026|22 sept/i);
    expect(within(neuf).getByText('Proposer « sans réponse »')).toBeInTheDocument();
  });

  it('la prise en charge en cours se montre quand l’API la rend ; un annonceur STOP aussi', async () => {
    parFile.to_contact = [
      ligne(10, { claim: { by: { id: 2, name: 'Fatou Sow' }, until: '2026-10-28T10:10:00+00:00', mine: false } }),
      ligne(11, { do_not_contact_at: '2026-10-20T10:00:00+00:00', display_name: null }),
    ];
    rendre();
    expect(within(await screen.findByTestId('radar-annonceur-10')).getByText('Pris en charge par Fatou Sow')).toBeInTheDocument();
    const stoppe = screen.getByTestId('radar-annonceur-11');
    expect(within(stoppe).getByText('Ne pas contacter')).toBeInTheDocument();
    expect(within(stoppe).getByText('Annonceur sans nom')).toBeInTheDocument();
  });

  it('une file vide dit pourquoi, onglet par onglet', async () => {
    const utilisateur = rendre();
    expect(await screen.findByText('Personne à contacter')).toBeInTheDocument();

    await utilisateur.click(screen.getByRole('tab', { name: 'En attente' }));
    expect(await screen.findByText('Aucun message en attente')).toBeInTheDocument();

    await utilisateur.click(screen.getByRole('tab', { name: 'À relancer' }));
    expect(await screen.findByText('Rien à relancer')).toBeInTheDocument();
  });

  it('la recherche part au serveur (nom ou numéro) et une recherche vide a son propre texte', async () => {
    const utilisateur = rendre();
    await screen.findByTestId('radar-annonceurs-vide');

    await utilisateur.type(screen.getByRole('searchbox', { name: 'Rechercher un annonceur' }), '77 123');
    await waitFor(() => expect(urls().some((u) => u.searchParams.get('filter[search]') === '77 123')).toBe(true));
    expect(await screen.findByText('Aucun annonceur trouvé')).toBeInTheDocument();
  });

  it('une recherche nouvelle repart de la page 1, même depuis la page 3', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const numero = Number(new URL(String(url), 'http://localhost').searchParams.get('page') ?? '1');
      return new Response(JSON.stringify({
        data: [ligne(numero)],
        meta: { total: 100, per_page: 25, current_page: numero, last_page: 4 },
      }), { status: 200 });
    });
    const utilisateur = rendre();
    await screen.findByTestId('radar-annonceur-1');

    await utilisateur.click(screen.getByRole('button', { name: /Suivant/ }));
    await screen.findByTestId('radar-annonceur-2');
    await utilisateur.click(screen.getByRole('button', { name: /Suivant/ }));
    await screen.findByTestId('radar-annonceur-3');
    expect(urls().at(-1)!.searchParams.get('page')).toBe('3');

    await utilisateur.type(screen.getByRole('searchbox', { name: 'Rechercher un annonceur' }), 'Moussa');
    await waitFor(() => expect(urls().some((u) => u.searchParams.get('filter[search]') === 'Moussa')).toBe(true));
    const recherche = urls().filter((u) => u.searchParams.get('filter[search]') === 'Moussa');
    expect(recherche.every((u) => u.searchParams.get('page') === '1')).toBe(true);
  });

  it('un viewer lit un seul refus, sans aucune requête', async () => {
    rendre(VIEWER);
    expect(screen.getByText(/réservé aux opérateurs support/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
