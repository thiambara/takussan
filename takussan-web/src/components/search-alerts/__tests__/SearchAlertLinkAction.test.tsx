/**
 * TCK-599 (ADR-0050 §4, contrainte 6) — les pages où mènent les liens d'un e-mail d'alerte.
 *
 * Ce qu'elles gardent : RIEN ne part au rendu (un scanneur de liens qui ouvre la page ne confirme
 * ni ne désinscrit personne) ; un clic, un `POST` ; un lien hors forme n'appelle pas l'API ; un
 * jeton refusé (422) ou une signature fausse (403) rendent « lien invalide », pas une panne.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import { SearchAlertLinkAction } from '../SearchAlertLinkAction';

const T = fr.search.alertPages;
const JETON = 'Zm9vYmFyYmF6cXV4cXV1eGNvcmdlZ3JhdWx0Z2FycGx5';
const SIGNATURE = 'b'.repeat(64);

let appels: { url: string; method: string; body: unknown }[] = [];
let statut = 200;

describe('<SearchAlertLinkAction> — TCK-599', () => {
  beforeEach(() => {
    appels = [];
    statut = 200;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        appels.push({
          url: String(url),
          method: init?.method ?? 'GET',
          body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
        });
        return new Response(JSON.stringify(statut === 200 ? { data: {} } : { code: 'x' }), { status: statut });
      }),
    );
  });

  it('confirmer : aucune requête au rendu, un POST { token } au clic', async () => {
    const user = userEvent.setup();
    render(withIntl(<SearchAlertLinkAction mode="confirm" token={JETON} />));

    expect(screen.getByText(T.confirm.body)).toBeInTheDocument();
    expect(appels).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: T.confirm.button }));

    expect(await screen.findByText(T.confirm.doneTitle)).toBeInTheDocument();
    expect(appels).toEqual([
      { url: expect.stringMatching(/\/api\/public\/search-alerts\/confirm$/), method: 'POST', body: { token: JETON } },
    ]);
  });

  it('confirmer : un jeton refusé (422) dit « lien invalide »', async () => {
    statut = 422;
    const user = userEvent.setup();
    render(withIntl(<SearchAlertLinkAction mode="confirm" token={JETON} />));

    await user.click(screen.getByRole('button', { name: T.confirm.button }));

    expect(await screen.findByTestId('search-alert-invalid')).toBeInTheDocument();
  });

  it('se désinscrire sans compte : POST { token } sur /public/search-alerts/unsubscribe', async () => {
    const user = userEvent.setup();
    render(withIntl(<SearchAlertLinkAction mode="unsubscribe" token={JETON} />));

    expect(screen.getByText(T.unsubscribe.bodyContact)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: T.unsubscribe.button }));

    expect(await screen.findByText(T.unsubscribe.doneContact)).toBeInTheDocument();
    expect(appels[0]).toEqual({
      url: expect.stringMatching(/\/api\/public\/search-alerts\/unsubscribe$/),
      method: 'POST',
      body: { token: JETON },
    });
  });

  it('se désinscrire d’une alerte de compte : POST sur l’URL signée ; 403 → « lien invalide »', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      withIntl(<SearchAlertLinkAction mode="unsubscribe" search="42" expires="1791000000" signature={SIGNATURE} />),
    );
    expect(screen.getByText(T.unsubscribe.bodyAccount)).toBeInTheDocument();
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
  ] as const)('un lien hors forme (%s, %j) rend « lien invalide » sans appeler l’API', async (mode, params) => {
    render(withIntl(<SearchAlertLinkAction mode={mode} {...params} />));

    expect(screen.getByTestId('search-alert-invalid')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    await waitFor(() => expect(appels).toHaveLength(0));
  });
});
