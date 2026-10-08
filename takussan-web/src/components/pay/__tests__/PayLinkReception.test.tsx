import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { withIntl, type LocaleDeTest } from '@/test/intl';
import { PayLinkReception } from '../PayLinkReception';

/**
 * TCK-602 (ADR-0051 §1, AC35) — la page `/pay/{jeton}` affiche les montants TELS QUE L'API LES
 * REND : `amount_due` est ce que le fournisseur encaissera, pénalité comprise ou non selon le
 * réglage de l'agence. La page ne les additionne jamais.
 */
const T = fr.payLink;
const JETON = 'A'.repeat(21) + '_-' + 'b'.repeat(20);

function lien(over: Record<string, unknown> = {}) {
  return {
    data: {
      reference: 'LP-2026-0001',
      status: 'late',
      currency: 'XOF',
      amount_due: 150000,
      late_fee_outstanding: 7500,
      late_fee_payable_online: false,
      period_start: '2026-09-01',
      period_end: '2026-09-30',
      due_date: '2026-09-05',
      property: { title: 'Appartement Mermoz', neighborhood: 'Mermoz' },
      agency: { name: 'Agence Teranga' },
      providers: ['wave'],
      receipt_available: false,
      expires_at: '2026-11-04T23:59:59+00:00',
      ...over,
    },
  };
}

function reponse(status: number, corps: unknown): Response {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

let appels: { url: string; method: string; body: string | null }[] = [];

function bouchonner(...reponses: Response[]) {
  const file = [...reponses];
  appels = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      appels.push({ url: String(url), method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : null });
      const suivante = file.shift();
      if (!suivante) throw new Error(`requête inattendue : ${String(url)}`);
      return suivante;
    }),
  );
}

/** Le texte d'un nœud, espaces insécables et fines repliés en espace simple. */
const texte = (el: Element | null) => (el?.textContent ?? '').replace(/[\s  ]+/g, ' ').trim();
const corpsDeLaPage = () => texte(document.body);

describe('<PayLinkReception> (TCK-602)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('AC35 — pénalité hors ligne : 150 000 à payer, 7 500 à part « à régler auprès de l’agence », jamais 157 500', async () => {
    bouchonner(reponse(200, lien()));
    render(withIntl(<PayLinkReception token={JETON} />));

    const montant = await screen.findByTestId('pay-amount');
    expect(texte(montant)).toContain('150 000');
    const aPart = screen.getByTestId('pay-late-fee-at-agency');
    expect(texte(aPart)).toContain('7 500');
    expect(texte(aPart)).toMatch(/à régler auprès de l'agence Agence Teranga/i);
    expect(corpsDeLaPage()).not.toContain('157 500');
    expect(corpsDeLaPage()).not.toContain('165 000');
    expect(screen.queryByTestId('pay-breakdown')).toBeNull();
  });

  it('AC35 — pénalité en ligne : 157 500 à payer, décomposé en 150 000 et 7 500, sans « à régler auprès de l’agence »', async () => {
    bouchonner(reponse(200, lien({ amount_due: 157500, late_fee_payable_online: true })));
    render(withIntl(<PayLinkReception token={JETON} />));

    const montant = await screen.findByTestId('pay-amount');
    expect(texte(montant)).toContain('157 500');
    const decomposition = screen.getByTestId('pay-breakdown');
    expect(texte(decomposition)).toContain('150 000');
    expect(texte(decomposition)).toContain('7 500');
    expect(screen.queryByTestId('pay-late-fee-at-agency')).toBeNull();
    expect(corpsDeLaPage()).not.toMatch(/régler auprès de l'agence/i);
    expect(corpsDeLaPage()).not.toContain('165 000');
  });

  it('lit le lien sans session, jeton encodé dans le chemin, et paie par le fournisseur proposé', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    bouchonner(reponse(200, lien()), reponse(200, { data: { checkout_url: 'https://pay.wave.example/c/1' } }));
    const user = userEvent.setup();
    render(withIntl(<PayLinkReception token={JETON} />));

    await user.click(await screen.findByRole('button', { name: T.payWith.replace('{provider}', 'Wave') }));

    expect(appels[0]).toMatchObject({ method: 'GET' });
    expect(appels[0].url).toMatch(new RegExp(`/api/pay/${JETON}$`));
    expect(appels[1].url).toMatch(new RegExp(`/api/pay/${JETON}/initiate$`));
    expect(JSON.parse(appels[1].body ?? '{}')).toEqual({ provider: 'wave' });
    expect(assign).toHaveBeenCalledWith('https://pay.wave.example/c/1');
  });

  it('un jeton qui réécrirait le chemin est refusé sans appel, et la page dit « introuvable »', async () => {
    // TCK-600 (ADR-0055 §6) — `cheminApi` refuse `/`, `?`, `#` et `..` au lieu de les encoder.
    bouchonner(reponse(404, { code: 'pay_link.not_found' }));
    render(withIntl(<PayLinkReception token="../me?x=1" />));

    expect(await screen.findByTestId('pay-not-found')).toBeInTheDocument();
    expect(appels).toHaveLength(0);
  });

  it('un jeton hors alphabet mais sans séparateur est encodé', async () => {
    bouchonner(reponse(404, { code: 'pay_link.not_found' }));
    render(withIntl(<PayLinkReception token="é t" />));

    expect(await screen.findByTestId('pay-not-found')).toBeInTheDocument();
    expect(appels[0].url).toMatch(/\/api\/pay\/%C3%A9%20t$/);
  });

  it('410 : le lien n’est plus valide, et la page nomme l’agence', async () => {
    bouchonner(reponse(410, { code: 'pay_link.gone', params: { agency: 'Agence Teranga' } }));
    render(withIntl(<PayLinkReception token={JETON} />));

    expect(await screen.findByTestId('pay-gone')).toBeInTheDocument();
    expect(corpsDeLaPage()).toContain('Agence Teranga');
  });

  it('au retour du fournisseur, relit l’état chez lui avant d’afficher, puis propose la quittance', async () => {
    bouchonner(
      reponse(200, { data: { status: 'paid', amount_due: 0, receipt_available: true } }),
      reponse(200, lien({ status: 'paid', amount_due: 0, late_fee_outstanding: 0, providers: [], receipt_available: true })),
    );
    render(withIntl(<PayLinkReception token={JETON} retour="success" />));

    expect(await screen.findByRole('button', { name: T.receipt })).toBeInTheDocument();
    expect(appels[0]).toMatchObject({ method: 'POST' });
    expect(appels[0].url).toMatch(new RegExp(`/api/pay/${JETON}/verify$`));
    expect(screen.queryByTestId('pay-amount')).toBeNull();
  });

  it.each<[LocaleDeTest, typeof fr.payLink]>([
    ['fr', fr.payLink],
    ['en', en.payLink as typeof fr.payLink],
    ['wo', wo.payLink as typeof fr.payLink],
  ])('AC21 — s’affiche en %s', async (locale, messages) => {
    bouchonner(reponse(200, lien()));
    render(withIntl(<PayLinkReception token={JETON} />, locale));

    expect(await screen.findByText(messages.amountDue)).toBeInTheDocument();
    expect(corpsDeLaPage()).toContain(messages.lateFee);
  });
});
