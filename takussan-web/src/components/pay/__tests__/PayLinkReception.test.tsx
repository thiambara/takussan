import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/fr/pay/jeton',
}));

import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { CoqueDeLien } from '@/components/lien-public/CoqueDeLien';
import { withIntl, type LocaleDeTest } from '@/test/intl';
import { PayLinkReception } from '../PayLinkReception';

/**
 * TCK-602 (ADR-0051 §1, AC35), refait par TCK-2505 — la page `/pay/{jeton}` affiche les montants
 * TELS QUE L'API LES REND : `amount_due` est ce que le fournisseur encaissera, pénalité comprise ou
 * non selon le réglage de l'agence. La page ne les additionne jamais.
 */
const T = fr.lienPublic.paiement;
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
      period_start: '2026-10-01',
      period_end: '2026-10-31',
      due_date: '2026-10-05',
      property: { title: 'Appartement Mermoz', neighborhood: 'Mermoz' },
      agency: { name: 'Agence Teranga' },
      providers: ['wave', 'orange_money'],
      receipt_available: false,
      expires_at: '2026-12-04T23:59:59+00:00',
      paid_at: null,
      offline_payment: null,
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
const texte = (el: Element | null) => (el?.textContent ?? '').replace(/[\s  ]+/g, ' ').trim();
const corpsDeLaPage = () => texte(document.body);

describe('<PayLinkReception> (TCK-602, TCK-2505)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('AC2 / AC35 — pénalité hors ligne : 150 000 à payer, 7 500 sur une ligne à part « à régler auprès de votre agence, {agence} », jamais 157 500', async () => {
    bouchonner(reponse(200, lien()));
    render(withIntl(<PayLinkReception token={JETON} />));

    const montant = await screen.findByTestId('pay-amount');
    expect(texte(montant)).toBe('150 000 F CFA');
    const aPart = screen.getByTestId('pay-late-fee-at-agency');
    expect(texte(aPart)).toContain('7 500');
    expect(texte(aPart)).toContain('À régler auprès de votre agence, Agence Teranga.');
    expect(texte(aPart)).toMatch(/n’est pas comprise dans le montant à payer en ligne/i);
    // La ligne de pénalité vit HORS du bloc du total.
    expect(montant.parentElement?.contains(aPart)).toBe(false);
    expect(corpsDeLaPage()).not.toContain('157 500');
    expect(corpsDeLaPage()).not.toContain('165 000');
    expect(screen.queryByTestId('pay-breakdown')).toBeNull();
  });

  it('AC1 / AC35 — pénalité en ligne : UN seul montant, égal à amount_due (157 500), pénalité dans le détail', async () => {
    bouchonner(reponse(200, lien({ amount_due: 157500, late_fee_payable_online: true })));
    render(withIntl(<PayLinkReception token={JETON} />));

    const montant = await screen.findByTestId('pay-amount');
    expect(texte(montant)).toBe('157 500 F CFA');
    const detail = screen.getByTestId('pay-breakdown');
    expect(texte(detail)).toContain('150 000');
    expect(texte(detail)).toContain('7 500');
    expect(screen.queryByTestId('pay-late-fee-at-agency')).toBeNull();
    expect(corpsDeLaPage()).not.toMatch(/régler auprès de/i);
    expect(corpsDeLaPage()).not.toContain('165 000');
  });

  it('hors ligne avec pénalité à part : UN total à régler à l’agence, loyer et pénalité compris, avec son détail', async () => {
    bouchonner(reponse(200, lien({ providers: [], offline_payment: { wave_number: '+221771234567' } })));
    render(withIntl(<PayLinkReception token={JETON} />));

    const montant = await screen.findByTestId('pay-amount');
    expect(texte(montant)).toBe('157 500 F CFA');
    expect(texte(montant.parentElement)).toContain(T.aReglerALAgence);
    expect(texte(screen.getByTestId('pay-breakdown'))).toBe('150 000 F CFA d’échéance + 7 500 F CFA de pénalité de retard');
    // Rien ne se paie en ligne ici : ni encart « à part », ni « montant à payer en ligne ».
    expect(screen.queryByTestId('pay-late-fee-at-agency')).toBeNull();
    expect(corpsDeLaPage()).not.toMatch(/à payer en ligne/i);
    expect(screen.queryByRole('button', { name: /Payer avec/ })).toBeNull();
  });

  it.each([
    ['en ligne, pénalité incluse', { amount_due: 158666, late_fee_outstanding: 7555.5, late_fee_payable_online: true }, '158 666', '151 110', '7 556'],
    ['hors ligne, pénalité à part', { amount_due: 150000, late_fee_outstanding: 7500.5, providers: [], offline_payment: { agency_phone: '+221338210000' } }, '157 501', '150 000', '7 501'],
  ] as const)('pénalité en ,5 (%s) : le détail fait toujours la somme du total', async (_cas, over, total, base, penalite) => {
    bouchonner(reponse(200, lien(over)));
    render(withIntl(<PayLinkReception token={JETON} />));

    expect(texte(await screen.findByTestId('pay-amount'))).toBe(`${total} F CFA`);
    const detail = texte(screen.getByTestId('pay-breakdown'));
    expect(detail).toBe(`${base} F CFA d’échéance + ${penalite} F CFA de pénalité de retard`);
    const nombre = (x: string) => Number(x.replace(/\s/g, ''));
    expect(nombre(base) + nombre(penalite)).toBe(nombre(total));
  });

  it('le nom de l’agence se dit seul, en apposition : jamais « l’agence Agence … », ni une préposition collée au nom', async () => {
    // « auprès de Agence … » est fautif et « auprès d’Agence … » ne tient pas pour tous les noms : aucune préposition
    // ne touche le nom, qui vient en apposition (« votre agence, Agence Teranga »).
    for (const over of [{}, { providers: [] }, { status: 'refunded' }, { providers: [], offline_payment: null, late_fee_outstanding: 0 }]) {
      bouchonner(reponse(200, lien(over)));
      const { unmount } = render(withIntl(<PayLinkReception token={JETON} />));
      await screen.findAllByText(/Agence Teranga/);
      expect(corpsDeLaPage()).not.toMatch(/l’agence Agence/);
      expect(corpsDeLaPage()).not.toMatch(/(?:\bde|\bà|\bchez|d’) Agence Teranga/i);
      unmount();
    }
  });

  it('nomme la période, le bien, l’agence émettrice ; deux boutons de paiement nommés en texte', async () => {
    bouchonner(reponse(200, lien()));
    render(withIntl(<PayLinkReception token={JETON} />));

    expect(await screen.findByRole('heading', { level: 1, name: 'Échéance d’octobre 2026' })).toBeInTheDocument();
    expect(corpsDeLaPage()).toContain('Appartement Mermoz · Mermoz');
    expect(within(screen.getByRole('banner')).getByText('Agence Teranga')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Payer avec Wave' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Payer avec Orange Money' })).toBeInTheDocument();
    expect(corpsDeLaPage()).toContain('En retard · échéance du 5 oct. 2026');
  });

  it('élide « de » devant une voyelle et pas ailleurs', async () => {
    bouchonner(reponse(200, lien({ period_start: '2026-03-01', period_end: '2026-03-31' })));
    render(withIntl(<PayLinkReception token={JETON} />));
    expect(await screen.findByRole('heading', { level: 1, name: 'Échéance de mars 2026' })).toBeInTheDocument();
  });

  it('lit le lien sans session, jeton encodé dans le chemin, et paie par le fournisseur choisi', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    bouchonner(reponse(200, lien()), reponse(200, { data: { checkout_url: 'https://pay.wave.example/c/1' } }));
    const user = userEvent.setup();
    render(withIntl(<PayLinkReception token={JETON} />));

    await user.click(await screen.findByRole('button', { name: 'Payer avec Orange Money' }));

    expect(appels[0]).toMatchObject({ method: 'GET' });
    expect(appels[0].url).toMatch(new RegExp(`/api/pay/${JETON}$`));
    expect(appels[1].url).toMatch(new RegExp(`/api/pay/${JETON}/initiate$`));
    expect(JSON.parse(appels[1].body ?? '{}')).toEqual({ provider: 'orange_money' });
    expect(assign).toHaveBeenCalledWith('https://pay.wave.example/c/1');
  });

  it('paiement en ligne ouvert ET moyens déclarés : « Payer directement à l’agence » sous les boutons', async () => {
    bouchonner(reponse(200, lien({ offline_payment: { wave_number: '+221771234567', agency_phone: '33 820 00 00' } })));
    render(withIntl(<PayLinkReception token={JETON} />));

    const horsLigne = await screen.findByTestId('pay-offline');
    expect(texte(horsLigne)).toContain(T.payerALAgence);
    expect(texte(horsLigne)).toContain('+221 77 123 45 67');
    expect(within(horsLigne).getByRole('link', { name: /Appeler/ })).toHaveAttribute('href', 'tel:+221338200000');
  });

  it('AC3 — paiement en ligne fermé, moyens déclarés : chaque moyen copiable, l’agence joignable, aucun bouton de paiement', async () => {
    bouchonner(
      reponse(
        200,
        lien({
          providers: [],
          offline_payment: {
            wave_number: '+221771234567',
            orange_money_number: '+221781112233',
            bank_details: 'CBAO\nSN08 SN010 01523',
            agency_phone: '+221338200000',
          },
        }),
      ),
    );
    // Après `userEvent.setup()`, qui pose son propre presse-papiers.
    const user = userEvent.setup();
    const ecrire = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: ecrire }, configurable: true });
    render(withIntl(<PayLinkReception token={JETON} />));

    const page = await screen.findByTestId('pay-unavailable');
    expect(texte(page)).toContain('Le paiement en ligne n’est pas ouvert pour cette échéance. Vous pouvez payer directement votre agence, Agence Teranga :');
    expect(texte(page)).toContain('+221 77 123 45 67');
    expect(texte(page)).toContain('+221 78 111 22 33');
    expect(texte(page)).toContain('SN08 SN010 01523');
    expect(screen.queryByRole('button', { name: /Payer avec/ })).toBeNull();
    // Le téléphone de l'agence : dans la liste des moyens, et sous le pouce.
    const liensDAppel = screen.getAllByRole('link', { name: 'Appeler le +221 33 820 00 00' });
    expect(liensDAppel).toHaveLength(2);
    for (const a of liensDAppel) expect(a).toHaveAttribute('href', 'tel:+221338200000');

    await user.click(screen.getByRole('button', { name: 'Copier : Wave' }));
    expect(ecrire).toHaveBeenCalledWith('771234567');
    await user.click(screen.getByRole('button', { name: 'Copier : Référence' }));
    expect(ecrire).toHaveBeenLastCalledWith('LP-2026-0001');
  });

  it('AC3 — paiement en ligne fermé SANS moyen déclaré : la page nomme l’agence et offre l’aide, jamais un cul-de-sac', async () => {
    bouchonner(reponse(200, lien({ providers: [], offline_payment: null })));
    render(withIntl(<PayLinkReception token={JETON} />));

    const page = await screen.findByTestId('pay-unavailable');
    expect(texte(page)).toContain('Adressez-vous à votre agence, Agence Teranga, pour régler');
    expect(screen.getByRole('link', { name: fr.lienPublic.mort.aide })).toHaveAttribute('href', 'mailto:contact@takussan.com');
    expect(screen.queryByTestId('pay-offline')).toBeNull();
  });

  it('déjà réglée : l’état, la date, la quittance et le partage — aucun montant ni bouton de paiement', async () => {
    bouchonner(
      reponse(
        200,
        lien({ status: 'paid', amount_due: 0, late_fee_outstanding: 0, providers: [], receipt_available: true, paid_at: '2026-11-02T10:15:00+00:00' }),
      ),
    );
    render(withIntl(<PayLinkReception token={JETON} />));

    expect(await screen.findByRole('heading', { level: 1, name: T.reglee })).toBeInTheDocument();
    expect(corpsDeLaPage()).toContain('Réglée le 2 nov. 2026');
    expect(screen.getByRole('button', { name: T.quittance })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: T.partager })).toBeInTheDocument();
    expect(screen.queryByTestId('pay-amount')).toBeNull();
    expect(screen.queryByRole('button', { name: /Payer avec/ })).toBeNull();
  });

  it('réglée mais pénalité due : la pénalité et les moyens hors ligne restent (TCK-2504)', async () => {
    bouchonner(
      reponse(
        200,
        lien({
          status: 'paid',
          amount_due: 0,
          late_fee_outstanding: 7500,
          providers: [],
          receipt_available: true,
          paid_at: '2026-11-02T10:15:00+00:00',
          offline_payment: { wave_number: '+221771234567' },
        }),
      ),
    );
    render(withIntl(<PayLinkReception token={JETON} />));

    await screen.findByRole('heading', { level: 1, name: T.reglee });
    expect(texte(screen.getByTestId('pay-late-fee-at-agency'))).toContain('7 500');
    expect(texte(screen.getByTestId('pay-offline'))).toContain('+221 77 123 45 67');
  });

  it('remboursée : se lit, sans quittance ni paiement, et dit à qui s’adresser', async () => {
    bouchonner(
      reponse(200, lien({ status: 'refunded', amount_due: 0, late_fee_outstanding: 0, providers: [], paid_at: '2026-11-02T10:15:00+00:00' })),
    );
    render(withIntl(<PayLinkReception token={JETON} />));

    expect(await screen.findByRole('heading', { level: 1, name: T.rembourseeTitre })).toBeInTheDocument();
    expect(corpsDeLaPage()).toContain('adressez-vous à votre agence, Agence Teranga.');
    expect(screen.queryByRole('button', { name: T.quittance })).toBeNull();
    expect(screen.queryByRole('button', { name: /Payer avec/ })).toBeNull();
  });

  it('au retour du fournisseur, relit l’état chez lui avant d’afficher, puis remercie', async () => {
    bouchonner(
      reponse(200, { data: { status: 'paid', amount_due: 0, receipt_available: true } }),
      reponse(200, lien({ status: 'paid', amount_due: 0, late_fee_outstanding: 0, providers: [], receipt_available: true, paid_at: '2026-11-02T10:15:00+00:00' })),
    );
    render(withIntl(<PayLinkReception token={JETON} retour="success" />));

    expect(await screen.findByRole('heading', { level: 1, name: T.merci })).toBeInTheDocument();
    expect(appels[0]).toMatchObject({ method: 'POST' });
    expect(appels[0].url).toMatch(new RegExp(`/api/pay/${JETON}/verify$`));
  });

  it('un jeton qui réécrirait le chemin est refusé sans appel, et la page dit « introuvable », avec ses deux issues', async () => {
    // TCK-600 (ADR-0055 §6) — `cheminApi` refuse `/`, `?`, `#` et `..` au lieu de les encoder.
    bouchonner(reponse(404, { code: 'pay_link.not_found' }));
    render(withIntl(<PayLinkReception token="../me?x=1" />));

    const mort = await screen.findByTestId('pay-not-found');
    expect(appels).toHaveLength(0);
    expect(within(mort).getByRole('link', { name: fr.lienPublic.mort.rechercher })).toHaveAttribute('href', '/fr/properties');
    expect(within(mort).getByRole('link', { name: fr.lienPublic.mort.aide })).toBeInTheDocument();
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
    expect(corpsDeLaPage()).toContain('Demandez un nouveau lien à votre agence, Agence Teranga.');
  });

  it('AC4 — dans sa coque : ni recherche, ni favoris, ni comparateur, ni barre d’onglets', async () => {
    bouchonner(reponse(200, lien()));
    render(
      withIntl(
        <CoqueDeLien>
          <PayLinkReception token={JETON} />
        </CoqueDeLien>,
      ),
    );

    await screen.findByTestId('pay-amount');
    expect(screen.queryByRole('search')).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(corpsDeLaPage()).not.toMatch(/favoris|comparer|rechercher/i);
    for (const a of screen.getAllByRole('link')) {
      expect(a.getAttribute('href')).not.toMatch(/\/(favorites|compare)\b/);
    }
  });

  it.each<[LocaleDeTest, typeof fr.lienPublic.paiement]>([
    ['fr', fr.lienPublic.paiement],
    ['en', en.lienPublic.paiement as typeof fr.lienPublic.paiement],
    ['wo', wo.lienPublic.paiement as typeof fr.lienPublic.paiement],
  ])('s’affiche en %s', async (locale, messages) => {
    bouchonner(reponse(200, lien()));
    render(withIntl(<PayLinkReception token={JETON} />, locale));

    expect(await screen.findByText(messages.aPayer)).toBeInTheDocument();
  });
});

/**
 * TCK-2778 — un lien `subject: late_fee` fait payer la pénalité de retard SEULE, restée due sur un loyer
 * PAYÉ : la page le dit (« Pénalité de retard », puis l'échéance), affiche `amount_due` tel quel (la
 * pénalité, sans loyer à additionner), et ne prend jamais l'échéance pour « réglée » tant que la
 * pénalité est due (`status` décrit le loyer).
 */
describe('<PayLinkReception> — la pénalité seule (TCK-2778)', () => {
  const P = fr.lienPublic.paiement.penaliteSeule;
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const penalite = (over: Record<string, unknown> = {}) =>
    lien({
      subject: 'late_fee',
      status: 'paid',
      paid_at: '2026-10-20T10:00:00+00:00',
      amount_due: 7500,
      late_fee_outstanding: 7500,
      late_fee_payable_online: true,
      late_fee_paid_at: null,
      receipt_available: true,
      ...over,
    });

  it('à payer en ligne : « Pénalité de retard » en titre, l’échéance dessous, 7 500 seuls, les fournisseurs — jamais « réglée », ni le loyer', async () => {
    bouchonner(reponse(200, penalite()));
    render(withIntl(<PayLinkReception token={JETON} />));

    expect(await screen.findByRole('heading', { level: 1, name: P.titre })).toBeInTheDocument();
    expect(corpsDeLaPage()).toContain('Échéance d’octobre 2026');
    expect(texte(screen.getByTestId('pay-amount'))).toBe('7 500 F CFA');
    expect(screen.getByText(P.aPayer)).toBeInTheDocument();
    expect(screen.getByText(P.loyerRegle)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Payer avec/ })).toHaveLength(2);
    expect(screen.queryByTestId('pay-breakdown')).toBeNull();
    expect(screen.queryByTestId('pay-paid')).toBeNull();
    expect(corpsDeLaPage()).not.toContain(T.reglee);
    expect(corpsDeLaPage()).not.toContain('150 000');
    expect(screen.queryByRole('button', { name: T.quittance })).toBeNull();
  });

  it('aucun fournisseur : la pénalité à régler à l’agence, ses moyens, sans bouton de paiement', async () => {
    bouchonner(reponse(200, penalite({ providers: [], late_fee_payable_online: false, offline_payment: { wave_number: '+221771234567' } })));
    render(withIntl(<PayLinkReception token={JETON} />));

    expect(await screen.findByRole('heading', { level: 1, name: P.titre })).toBeInTheDocument();
    expect(screen.getByText(P.aReglerALAgence)).toBeInTheDocument();
    expect(texte(screen.getByTestId('pay-amount'))).toBe('7 500 F CFA');
    expect(corpsDeLaPage()).toContain('Vous pouvez la régler directement à votre agence, Agence Teranga');
    expect(screen.queryByRole('button', { name: /Payer avec/ })).toBeNull();
  });

  it('pénalité réglée (AC7 : `late_fee_paid_at`, rien de dû) : l’état et sa date, plus rien à payer', async () => {
    bouchonner(reponse(200, penalite({ amount_due: 0, late_fee_outstanding: 0, providers: [], late_fee_paid_at: '2026-11-12T09:00:00+00:00' })));
    render(withIntl(<PayLinkReception token={JETON} />));

    expect(await screen.findByRole('heading', { level: 1, name: P.regleeTitre })).toBeInTheDocument();
    expect(corpsDeLaPage()).toContain('Réglée le 12 nov. 2026');
    expect(screen.getByRole('heading', { level: 2, name: P.titre })).toBeInTheDocument();
    expect(screen.queryByTestId('pay-amount')).toBeNull();
    expect(screen.queryByRole('button', { name: /Payer avec/ })).toBeNull();
  });

  it('un lien de loyer (`subject: rent`) garde la page du loyer', async () => {
    bouchonner(reponse(200, lien({ subject: 'rent' })));
    render(withIntl(<PayLinkReception token={JETON} />));

    expect(texte(await screen.findByTestId('pay-amount'))).toBe('150 000 F CFA');
    expect(screen.queryByText(P.titre)).toBeNull();
  });
});
