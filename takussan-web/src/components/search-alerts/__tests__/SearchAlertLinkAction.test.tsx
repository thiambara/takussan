/**
 * TCK-599 (ADR-0050 §4, contrainte 6) — les pages où mènent les liens d'un e-mail d'alerte.
 *
 * Ce qu'elles gardent : RIEN ne part au rendu qui agisse (un scanneur de liens qui ouvre la page ne
 * confirme ni ne désinscrit personne) — la seule requête du chargement est la LECTURE `GET by-token`
 * (TCK-2513), qui ne consomme rien ; un clic, un `POST` ; un lien hors forme n'appelle pas l'API ; un
 * jeton refusé (422) ou une signature fausse (403) rendent « lien mort », pas une panne.
 *
 * TCK-2514 — critères en pastilles et compte de biens, « Plutôt une fois par semaine » avant « Me
 * désinscrire », titre de la désinscription sans compte qui dit qu'elle arrête TOUT.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import fr from '@/messages/fr.json';
import en from '@/messages/en.json';
import { withIntl } from '@/test/intl';
import { SearchAlertLinkAction } from '../SearchAlertLinkAction';

const T = fr.search.alertPages;
const L = fr.lienPublic.alerte;
const M = fr.lienPublic.mort;
const JETON = 'Zm9vYmFyYmF6cXV4cXV1eGNvcmdlZ3JhdWx0Z2FycGx5';
const SIGNATURE = 'b'.repeat(64);

let appels: { url: string; method: string; body: unknown }[] = [];
let statut = 200;
/** La réponse de `GET by-token` : l'alerte lue, ou un statut d'échec. */
let lecture: { status: number; data?: unknown } = { status: 404 };

function alerte(over: Record<string, unknown> = {}) {
  return {
    kind: 'unsubscribe',
    name: 'Appartement à Mermoz',
    criteria: { type: ['apartment'], location: 'Mermoz', contract_type: 'rent', price_max: 700000 },
    frequency: 'daily',
    matches: 38,
    ...over,
  };
}

function lue(over: Record<string, unknown> = {}) {
  lecture = { status: 200, data: alerte(over) };
}

const posts = () => appels.filter((a) => a.method !== 'GET');

describe('<SearchAlertLinkAction> — TCK-599, TCK-2514', () => {
  beforeEach(() => {
    appels = [];
    statut = 200;
    lecture = { status: 404 };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        appels.push({
          url: String(url),
          method,
          body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
        });
        if (method === 'GET' && String(url).includes('/by-token')) {
          return new Response(JSON.stringify(lecture.status === 200 ? { data: lecture.data } : { message: 'x' }), {
            status: lecture.status,
          });
        }
        return new Response(JSON.stringify(statut === 200 ? { data: {} } : { code: 'x' }), { status: statut });
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('confirmer : au chargement, une LECTURE et aucun POST ; un POST { token } au clic', async () => {
    lue({ kind: 'confirm' });
    const user = userEvent.setup();
    render(withIntl(<SearchAlertLinkAction mode="confirm" token={JETON} />));

    expect(await screen.findByRole('heading', { level: 1, name: T.confirm.title })).toBeInTheDocument();
    expect(screen.getByText(T.confirm.body)).toBeInTheDocument();
    expect(appels).toEqual([
      { url: expect.stringMatching(new RegExp(`/api/public/search-alerts/by-token\\?token=${JETON}$`)), method: 'GET', body: null },
    ]);

    await user.click(screen.getByRole('button', { name: T.confirm.button }));

    expect(await screen.findByText(T.confirm.doneTitle)).toBeInTheDocument();
    expect(posts()).toEqual([
      { url: expect.stringMatching(/\/api\/public\/search-alerts\/confirm$/), method: 'POST', body: { token: JETON } },
    ]);
  });

  it('les critères en pastilles et « N biens déjà en ligne », sur la confirmation et après', async () => {
    lue({ kind: 'confirm' });
    const user = userEvent.setup();
    render(withIntl(<SearchAlertLinkAction mode="confirm" token={JETON} />));

    const criteres = await screen.findByTestId('alerte-criteres');
    const puces = within(criteres).getAllByRole('listitem').map((li) => li.textContent);
    expect(puces).toEqual(expect.arrayContaining(['Quartier : Mermoz', 'Appartement']));
    expect(puces).toHaveLength(4);
    expect(screen.getByTestId('alerte-compte')).toHaveTextContent('38 biens déjà en ligne');

    await user.click(screen.getByRole('button', { name: T.confirm.button }));
    const voir = await screen.findByRole('link', { name: 'Voir les 38 biens déjà en ligne' });
    expect(voir.getAttribute('href')).toMatch(/\/fr\/properties\?.*location=Mermoz/);
    expect(screen.getByRole('link', { name: L.autreRecherche })).toHaveAttribute('href', '/fr/properties');
  });

  it('matches: null — aucun chiffre ; matches: 0 — « aucun bien », jamais « 0 biens »', async () => {
    lue({ matches: null });
    const { unmount } = render(withIntl(<SearchAlertLinkAction mode="unsubscribe" token={JETON} />));
    await screen.findByTestId('alerte-criteres');
    expect(screen.queryByTestId('alerte-compte')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d+ biens?/);
    unmount();

    lue({ matches: 0 });
    render(withIntl(<SearchAlertLinkAction mode="unsubscribe" token={JETON} />));
    expect(await screen.findByTestId('alerte-compte')).toHaveTextContent(L.aucunEnLigne);
  });

  it('AC1 — charger la page de désinscription n’émet AUCUN POST', async () => {
    lue();
    render(withIntl(<SearchAlertLinkAction mode="unsubscribe" token={JETON} />));

    await screen.findByRole('button', { name: L.uneFoisParSemaine });
    await new Promise((r) => setTimeout(r, 50));
    expect(posts()).toHaveLength(0);
    expect(appels.map((a) => a.method)).toEqual(['GET']);
  });

  it('le titre de la désinscription sans compte dit qu’elle arrête TOUTES les alertes', async () => {
    lue();
    render(withIntl(<SearchAlertLinkAction mode="unsubscribe" token={JETON} />));

    expect(await screen.findByRole('heading', { level: 1, name: L.desinscrireTitre })).toBeInTheDocument();
    expect(screen.queryByText(T.unsubscribe.title)).toBeNull();
    expect(screen.getByText(L.desinscrireTexte)).toBeInTheDocument();
  });

  it('AC2 — « Plutôt une fois par semaine » appelle frequency { token, weekly } et laisse l’abonné inscrit', async () => {
    lue();
    const user = userEvent.setup();
    render(withIntl(<SearchAlertLinkAction mode="unsubscribe" token={JETON} />));

    // Les deux gestes sont visibles, la semaine d'abord.
    const boutons = (await screen.findAllByRole('button')).map((b) => b.textContent);
    expect(boutons).toEqual([L.uneFoisParSemaine, T.unsubscribe.button]);

    await user.click(screen.getByRole('button', { name: L.uneFoisParSemaine }));

    expect(await screen.findByTestId('search-alert-weekly')).toHaveTextContent(L.hebdoFaitTitre);
    expect(posts()).toEqual([
      {
        url: expect.stringMatching(/\/api\/public\/search-alerts\/frequency$/),
        method: 'POST',
        body: { token: JETON, frequency: 'weekly' },
      },
    ]);
    expect(appels.some((a) => a.url.endsWith('/unsubscribe'))).toBe(false);
  });

  it('AC2 — « Me désinscrire » appelle unsubscribe { token }', async () => {
    lue();
    const user = userEvent.setup();
    render(withIntl(<SearchAlertLinkAction mode="unsubscribe" token={JETON} />));

    await user.click(await screen.findByRole('button', { name: T.unsubscribe.button }));

    expect(await screen.findByText(T.unsubscribe.doneContact)).toBeInTheDocument();
    expect(posts()).toEqual([
      { url: expect.stringMatching(/\/api\/public\/search-alerts\/unsubscribe$/), method: 'POST', body: { token: JETON } },
    ]);
  });

  it('une alerte déjà hebdomadaire ne propose pas la semaine', async () => {
    lue({ frequency: 'weekly' });
    render(withIntl(<SearchAlertLinkAction mode="unsubscribe" token={JETON} />));

    expect(await screen.findByRole('button', { name: T.unsubscribe.button })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: L.uneFoisParSemaine })).toBeNull();
  });

  it('AC3 — un jeton inconnu (404 à la lecture) : lien mort, ses deux issues, sans critères ni bouton d’action', async () => {
    lecture = { status: 404 };
    render(withIntl(<SearchAlertLinkAction mode="unsubscribe" token={JETON} />));

    const mort = await screen.findByTestId('search-alert-invalid');
    expect(within(mort).getByRole('heading', { level: 1 })).toHaveTextContent(T.invalidTitle);
    expect(within(mort).getByRole('link', { name: M.rechercher })).toHaveAttribute('href', '/fr/properties');
    expect(within(mort).getByRole('link', { name: M.aide })).toHaveAttribute('href', 'mailto:contact@takussan.com');
    expect(screen.queryByTestId('alerte-criteres')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(posts()).toHaveLength(0);
  });

  it('un jeton de désinscription ouvert sur la page de confirmation est un lien mort', async () => {
    lue({ kind: 'unsubscribe' });
    render(withIntl(<SearchAlertLinkAction mode="confirm" token={JETON} />));

    expect(await screen.findByTestId('search-alert-invalid')).toBeInTheDocument();
  });

  it('une panne de la lecture (500) n’empêche pas d’agir : la page reste, sans critères', async () => {
    lecture = { status: 500 };
    render(withIntl(<SearchAlertLinkAction mode="unsubscribe" token={JETON} />));

    expect(await screen.findByRole('button', { name: T.unsubscribe.button })).toBeInTheDocument();
    expect(screen.queryByTestId('alerte-criteres')).toBeNull();
    expect(screen.queryByTestId('alerte-compte')).toBeNull();
  });

  it('confirmer : un jeton refusé (422) dit « lien mort »', async () => {
    lue({ kind: 'confirm' });
    statut = 422;
    const user = userEvent.setup();
    render(withIntl(<SearchAlertLinkAction mode="confirm" token={JETON} />));

    await user.click(await screen.findByRole('button', { name: T.confirm.button }));

    expect(await screen.findByTestId('search-alert-invalid')).toBeInTheDocument();
  });

  it('une panne (500) au clic passe par ErrorState et garde les boutons', async () => {
    lue();
    statut = 500;
    const user = userEvent.setup();
    render(withIntl(<SearchAlertLinkAction mode="unsubscribe" token={JETON} />));

    await user.click(await screen.findByRole('button', { name: T.unsubscribe.button }));

    expect(await screen.findByRole('alert')).toHaveTextContent(T.error);
    expect(screen.getByRole('button', { name: T.unsubscribe.button })).toBeEnabled();
  });

  it('se désinscrire d’une alerte de compte : aucune lecture, POST sur l’URL signée ; 403 → lien mort', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      withIntl(<SearchAlertLinkAction mode="unsubscribe" search="42" expires="1791000000" signature={SIGNATURE} />),
    );
    // Seule CETTE alerte s'arrête : le titre le dit, et la semaine n'est pas proposée.
    expect(screen.getByRole('heading', { level: 1, name: T.unsubscribe.title })).toBeInTheDocument();
    expect(screen.getByText(T.unsubscribe.bodyAccount)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: L.uneFoisParSemaine })).toBeNull();
    expect(appels).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: T.unsubscribe.button }));
    expect(await screen.findByText(T.unsubscribe.doneAccount)).toBeInTheDocument();
    expect(appels[0].url).toMatch(/\/api\/saved-searches\/42\/unsubscribe\?expires=1791000000&signature=b{64}$/);
    expect(appels[0].method).toBe('POST');
    unmount();

    statut = 403;
    render(withIntl(<SearchAlertLinkAction mode="unsubscribe" search="42" expires="1791000000" signature={SIGNATURE} />));
    await user.click(screen.getByRole('button', { name: T.unsubscribe.button }));
    expect(await screen.findByTestId('search-alert-invalid')).toBeInTheDocument();
  });

  it.each([
    ['confirm', { token: null }],
    ['confirm', { token: '../x' }],
    ['unsubscribe', { token: 'abc?def=1' }],
    ['unsubscribe', { search: '../1', expires: '1791000000', signature: SIGNATURE }],
    ['unsubscribe', { search: '42?x=1', expires: '1791000000', signature: SIGNATURE }],
    ['unsubscribe', { search: '42', expires: '1791000000', signature: 'pas-une-signature' }],
  ] as const)('un lien hors forme (%s, %j) rend « lien mort » sans appeler l’API', async (mode, params) => {
    render(withIntl(<SearchAlertLinkAction mode={mode} {...params} />));

    expect(screen.getByTestId('search-alert-invalid')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    await waitFor(() => expect(appels).toHaveLength(0));
  });

  it('en anglais : titres et gestes traduits', async () => {
    lue();
    render(withIntl(<SearchAlertLinkAction mode="unsubscribe" token={JETON} />, 'en'));

    expect(await screen.findByRole('heading', { level: 1, name: en.lienPublic.alerte.desinscrireTitre })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: en.lienPublic.alerte.uneFoisParSemaine })).toBeInTheDocument();
    expect(screen.getByTestId('alerte-compte')).toHaveTextContent('38 properties already listed');
  });
});
