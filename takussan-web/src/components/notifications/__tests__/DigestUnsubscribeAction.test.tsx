/**
 * P97.06 (TCK-1183) — la page où mène le lien de désabonnement du résumé par e-mail.
 *
 * Ce qu'elle garde, comme les pages d'alerte (ADR-0050) : RIEN ne part au rendu (un analyseur de
 * liens qui ouvre la page ne désinscrit personne) ; un clic, un `POST` sur l'URL signée ; un lien
 * hors forme n'appelle pas l'API ; une signature fausse ou échue (403) rend « lien invalide ».
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import { DigestUnsubscribeAction } from '../DigestUnsubscribeAction';

const T = fr.digestUnsubscribe;
const SIGNATURE = 'c'.repeat(64);

let appels: { url: string; method: string }[] = [];
let statut = 200;

describe('<DigestUnsubscribeAction> — P97.06', () => {
  beforeEach(() => {
    appels = [];
    statut = 200;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        appels.push({ url: String(url), method: init?.method ?? 'GET' });
        return new Response(JSON.stringify(statut === 200 ? { data: { email_frequency: 'off' } } : { message: 'x' }), {
          status: statut,
        });
      }),
    );
  });

  it('aucune requête au rendu, un POST sur l’URL signée au clic', async () => {
    const user = userEvent.setup();
    render(withIntl(<DigestUnsubscribeAction user="7" expires="1791000000" signature={SIGNATURE} />));

    expect(screen.getByText(T.body)).toBeInTheDocument();
    expect(appels).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: T.button }));

    expect(await screen.findByText(T.doneBody)).toBeInTheDocument();
    expect(appels).toHaveLength(1);
    expect(appels[0].url).toMatch(/\/api\/notifications\/digest\/unsubscribe\/7\?expires=1791000000&signature=c{64}$/);
    expect(appels[0].method).toBe('POST');
  });

  it('une signature refusée ou échue (403) dit « lien invalide »', async () => {
    statut = 403;
    const user = userEvent.setup();
    render(withIntl(<DigestUnsubscribeAction user="7" expires="1791000000" signature={SIGNATURE} />));

    await user.click(screen.getByRole('button', { name: T.button }));

    expect(await screen.findByTestId('digest-unsubscribe-invalid')).toBeInTheDocument();
  });

  it('une autre erreur laisse le bouton et le dit', async () => {
    statut = 500;
    const user = userEvent.setup();
    render(withIntl(<DigestUnsubscribeAction user="7" expires="1791000000" signature={SIGNATURE} />));

    await user.click(screen.getByRole('button', { name: T.button }));

    expect(await screen.findByRole('alert')).toHaveTextContent(T.error);
    expect(screen.getByRole('button', { name: T.button })).toBeInTheDocument();
  });

  it.each([
    [{ user: null, expires: '1791000000', signature: SIGNATURE }],
    [{ user: '../1', expires: '1791000000', signature: SIGNATURE }],
    [{ user: '7?x=1', expires: '1791000000', signature: SIGNATURE }],
    [{ user: '0', expires: '1791000000', signature: SIGNATURE }],
    [{ user: '7', expires: null, signature: SIGNATURE }],
    [{ user: '7', expires: '1791000000', signature: 'pas-une-signature' }],
  ])('un lien hors forme (%j) rend « lien invalide » sans appeler l’API', async (params) => {
    render(withIntl(<DigestUnsubscribeAction {...params} />));

    expect(screen.getByTestId('digest-unsubscribe-invalid')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    await waitFor(() => expect(appels).toHaveLength(0));
  });
});
