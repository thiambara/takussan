/**
 * P97.06 (TCK-1243, ADR-0050) — la page du lien « se désabonner » du résumé par courriel.
 *
 * Ce qu'elle garde : RIEN ne part au rendu (un analyseur de liens qui ouvre la page ne désabonne
 * personne) ; un clic, un `POST` sur l'URL signée ; un lien hors forme n'appelle pas l'API ; une
 * signature fausse ou expirée (403) rend « lien invalide », pas une panne.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import { DigestUnsubscribeAction } from '../DigestUnsubscribeAction';
import DigestUnsubscribePage, { generateMetadata } from '@/app/[locale]/(public)/notifications/unsubscribe/page';

vi.mock('next-intl/server', () => ({ getTranslations: async () => (cle: string) => cle }));
vi.mock('@/components/home/Navbar', () => ({ Navbar: () => null }));
vi.mock('@/components/home/NavbarSpacer', () => ({ NavbarSpacer: () => null }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => null }));

const T = fr.search.alertPages;
const SIGNATURE = 'a'.repeat(64);

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
    render(withIntl(<DigestUnsubscribeAction user="42" expires="1893456000" signature={SIGNATURE} />));

    expect(screen.getByText(T.digest.body)).toBeInTheDocument();
    expect(appels).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: T.digest.button }));

    expect(await screen.findByText(T.digest.doneTitle)).toBeInTheDocument();
    expect(appels).toEqual([
      {
        url: expect.stringMatching(
          new RegExp(`/api/notifications/digest/unsubscribe/42\\?expires=1893456000&signature=${SIGNATURE}$`),
        ),
        method: 'POST',
      },
    ]);
  });

  it('une signature refusée (403) dit « lien invalide »', async () => {
    statut = 403;
    const user = userEvent.setup();
    render(withIntl(<DigestUnsubscribeAction user="42" expires="1893456000" signature={SIGNATURE} />));

    await user.click(screen.getByRole('button', { name: T.digest.button }));

    expect(await screen.findByTestId('digest-unsubscribe-invalid')).toBeInTheDocument();
  });

  it('une panne (500) laisse le bouton et dit l’échec', async () => {
    statut = 500;
    const user = userEvent.setup();
    render(withIntl(<DigestUnsubscribeAction user="42" expires="1893456000" signature={SIGNATURE} />));

    await user.click(screen.getByRole('button', { name: T.digest.button }));

    expect(await screen.findByRole('alert')).toHaveTextContent(T.error);
  });

  it.each([
    [{ user: '../1', expires: '1893456000', signature: SIGNATURE }],
    [{ user: '42', expires: null, signature: SIGNATURE }],
    [{ user: '42', expires: '1893456000', signature: 'zz' }],
    [{ user: null, expires: null, signature: null }],
  ])('un lien hors forme rend « lien invalide » sans appeler l’API (%o)', (lien) => {
    render(withIntl(<DigestUnsubscribeAction {...lien} />));

    expect(screen.getByTestId('digest-unsubscribe-invalid')).toBeInTheDocument();
    expect(appels).toHaveLength(0);
  });
});

describe('/[locale]/notifications/unsubscribe — la page', () => {
  it('no-referrer et jamais indexée : la signature est dans l’URL', async () => {
    const metadata = await generateMetadata();

    expect(metadata.referrer).toBe('no-referrer');
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('transmet les paramètres du lien au bouton', async () => {
    const page = await DigestUnsubscribePage({
      searchParams: Promise.resolve({ user: '42', expires: '1893456000', signature: SIGNATURE }),
    });
    render(withIntl(page));

    expect(screen.getByRole('button', { name: T.digest.button })).toBeInTheDocument();
  });
});
