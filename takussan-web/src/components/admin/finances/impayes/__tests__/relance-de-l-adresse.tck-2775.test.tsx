/**
 * TCK-2775 — l'écran Impayés ouvre la relance depuis son adresse (décision du porteur du 2026-11-14,
 * n° 16 b) : `?relance=<échéance>` ouvre la relance de l'échéance, `?relance=file` la file guidée ;
 * une échéance absente n'ouvre rien et le dit ; lue, la demande quitte l'adresse.
 *
 * La page est reproduite telle que `AdminFinancesClient` la monte : `useRelanceDemandeeParLAdresse`
 * (qui lit et retire le paramètre) au-dessus d'`Impayes`. Le réseau est un faux serveur derrière
 * `apiRequest` : chaque requête est relevée, méthode comprise (« aucun appel non-GET au chargement »).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import userEvent from '@testing-library/user-event';
import { createTranslator } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { navigationDeTest } from '@/test/navigation-url';
import { withIntl } from '@/test/intl';
import type { PaymentHistoryRow } from '@/types/invoice';

const reseau = vi.hoisted(() => ({ appels: [] as { chemin: string; methode: string; corps?: unknown }[], panne: false }));
const toastAdd = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', async () => (await import('@/test/navigation-url')).moduleNavigation);
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));
vi.mock('@/context/AuthContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/context/AuthContext')>()),
  useAuth: () => ({ token: 'jeton', user: { id: 9, agency_id: 1 } }),
}));
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({
    data: { data: [{ id: 'agent:1', agency: { id: 1, name: 'Keur Immo', slug: 'keur-immo' } }], meta: { active_profile_id: 'agent:1', count: 1 } },
    isLoading: false,
  }),
}));
// Le message passe par la VRAIE action serveur (celle de la file « À traiter » et de l'écran).
const DICTIONNAIRES = { fr, en, wo } as const;
vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale, namespace }: { locale: keyof typeof DICTIONNAIRES; namespace: string }) =>
    createTranslator({ locale, messages: DICTIONNAIRES[locale], namespace: namespace as never }),
}));
const LIEN_DE_PAIEMENT = 'https://www.takussan.com/pay/k7Qm2xR9';
vi.mock('@/components/leases/LeasePaymentDialog', () => ({ LeasePaymentDialog: () => null }));

function ligne(id: number, jours: number, extra: Partial<PaymentHistoryRow> = {}): PaymentHistoryRow {
  return {
    source: 'lease',
    id,
    reference_number: `LP-${id}`,
    amount: 250_000,
    currency: 'XOF',
    payment_method: null,
    payment_type: 'rent',
    status: 'late',
    paid_amount: 0,
    remaining_amount: 250_000,
    amount_due: 250_000,
    late_fee_amount: null,
    date: '2026-10-01T00:00:00Z',
    paid_at: null,
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    due_date: '2026-10-07',
    booking_id: null,
    lease_id: 100 + id,
    property_id: 200 + id,
    customer_id: 300 + id,
    created_at: '2026-09-01T00:00:00Z',
    days_late: jours,
    payer: { id: 300 + id, name: `Locataire ${id}`, phone: '+221771234567', first_name: `Prénom${id}`, locale: null },
    property: { id: 200 + id, title: `Studio ${id}`, reference_number: null },
    landlord: { id: 50, name: 'Mme Seck' },
    last_reminder: null,
    reminders_count: 0,
    ...extra,
  } as PaymentHistoryRow;
}

let lignes: PaymentHistoryRow[] = [];

vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiRequest: async (chemin: string, options: { method?: string } = {}) => {
      const methode = options.method ?? 'GET';
      reseau.appels.push({ chemin, methode, corps: (options as { body?: unknown }).body });
      const url = new URL(chemin, 'http://api.test');
      if (url.pathname === '/api/payments/history') {
        const parPage = Number(url.searchParams.get('per_page') ?? 20);
        if (reseau.panne && parPage === 100) throw new reel.ApiError(500, {});
        const min = Number(url.searchParams.get('filter[days_late_min]') ?? 0);
        const max = Number(url.searchParams.get('filter[days_late_max]') ?? Infinity);
        const bail = url.searchParams.get('filter[entity_id]');
        const page = Number(url.searchParams.get('page') ?? 1);
        const tri = lignes
          .filter((l) => (l.days_late ?? 0) >= min && (l.days_late ?? 0) <= max && l.status !== 'paid')
          .filter((l) => (bail ? l.source === 'lease' && l.lease_id === Number(bail) : true))
          .sort((a, b) => (b.days_late ?? 0) - (a.days_late ?? 0));
        return {
          data: tri.slice((page - 1) * parPage, page * parPage),
          meta: { current_page: page, last_page: Math.max(1, Math.ceil(tri.length / parPage)), per_page: parPage, total: tri.length, from: 1, to: 1, totals: { count: tri.length, amount: 0, paid_amount: 0, remaining_amount: 0 } },
        };
      }
      if (url.pathname === '/api/agencies/1/finance/aging') {
        const vide = { count: 0, amount: 0 };
        return { data: { group_by: 'tenant', buckets: { '1_30': vide, '31_60': vide, '61_90': vide, '90_plus': vide }, total: { count: lignes.length, amount: 1 }, rows: [], deposits_held: { total: 0, by_landlord: [] } } };
      }
      if (/^\/api\/lease-payments\/\d+\/reminders$/.test(url.pathname) && methode === 'GET') return { data: [] };
      if (/\/deposit-refund$/.test(url.pathname)) return { data: { deposit_amount: 0, deposit_refunded_amount: 0, deposit_remaining: 0, deposit_refunded_at: null, deposit_refund_reason: null, state: 'none', attachments: [] } };
      if (/^\/api\/lease-payments\/\d+\/payment-link$/.test(url.pathname) && methode === 'POST') return { data: { url: LIEN_DE_PAIEMENT, expires_at: null } };
      if (/^\/api\/lease-payments\/\d+\/reminders$/.test(url.pathname) && methode === 'POST') {
        return { data: { id: 1, at: '2026-11-14T09:00:00Z', source: 'manual', channel: 'whatsapp', by: { id: 9, name: 'Sokhna Sène' }, note: null, milestone: null } };
      }
      if (methode === 'GET') return { data: [] };
      throw new Error(`requête inattendue : ${methode} ${chemin}`);
    },
  };
});

const { Impayes } = await import('../Impayes');
const { useRelanceDemandeeParLAdresse } = await import('../relance-de-l-adresse');

/** La page d'« Argent », réduite à ce qu'elle fait de l'adresse. */
function Page() {
  const relance = useRelanceDemandeeParLAdresse();
  return <Impayes agencyId={1} relanceDemandee={relance.demande} onRelancePrise={relance.prise} />;
}

function bureau(actif: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: actif && /64rem|80rem/.test(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <StrictMode>
      {withIntl(
        <QueryClientProvider client={client}>
          <Page />
        </QueryClientProvider>,
      )}
    </StrictMode>,
  );
}

const nonGet = () => reseau.appels.filter((a) => a.methode !== 'GET');
const lecturesDeLaFile = () => reseau.appels.filter((a) => a.chemin.startsWith('/api/payments/history') && a.chemin.includes('per_page=100'));
const titres = () => toastAdd.mock.calls.map(([t]) => (t as { title: string }).title);

beforeEach(() => {
  // `history.replaceState` est le retrait de la page (Next 16 le reporte sur `useSearchParams`) : le
  // double de `next/navigation` le reçoit comme un remplacement.
  vi.spyOn(window.history, 'replaceState').mockImplementation((_etat, _titre, url) => navigationDeTest.replace(String(url ?? '')));
  reseau.appels.length = 0;
  reseau.panne = false;
  toastAdd.mockClear();
  bureau(false);
  lignes = [ligne(77, 40), ligne(78, 12), ligne(90, 60, { source: 'booking', lease_id: null }), ligne(91, 55)];
});
afterEach(() => {
  vi.mocked(window.history.replaceState).mockRestore();
  navigationDeTest.reinitialiser('');
});

describe('TCK-2775 — `?relance=<échéance>`', () => {
  it('AC1 — `relance=77` ouvre la feuille de relance de l’échéance 77 (téléphone) ; aucun appel non-GET au chargement', async () => {
    navigationDeTest.reinitialiser('tab=impayes&relance=77');
    rendre();

    const feuille = await screen.findByRole('dialog', { name: 'Relancer Locataire 77' });
    expect(within(feuille).getByRole('button', { name: /Ouvrir WhatsApp/ })).toBeInTheDocument();
    expect(nonGet()).toEqual([]);
    // Une seule lecture, malgré les effets doublés du mode strict.
    expect(lecturesDeLaFile()).toHaveLength(1);
    expect(toastAdd).not.toHaveBeenCalled();
  });

  it('… au bureau, le dossier de l’échéance s’ouvre en mode relance (le geste de l’écran)', async () => {
    bureau(true);
    navigationDeTest.reinitialiser('tab=impayes&relance=77');
    rendre();

    const dossier = await screen.findByRole('dialog', { name: 'Locataire 77' });
    expect(await within(dossier).findByRole('button', { name: /Ouvrir WhatsApp/ })).toBeInTheDocument();
    expect(nonGet()).toEqual([]);
  });

  it('`bail` restreint la lecture au bail : l’échéance est retrouvée sans les 100 plus en retard de l’agence', async () => {
    navigationDeTest.reinitialiser('tab=impayes&relance=78&bail=178');
    rendre();

    await screen.findByRole('dialog', { name: 'Relancer Locataire 78' });
    const lue = new URL(lecturesDeLaFile()[0]!.chemin, 'http://api.test').searchParams;
    expect([lue.get('filter[entity_type]'), lue.get('filter[entity_id]'), lue.get('filter[days_late_min]')]).toEqual(['lease', '178', '1']);
  });

  it('AC3 — `relance=999` (absente) : rien ne s’ouvre, un message le dit, la liste s’affiche', async () => {
    navigationDeTest.reinitialiser('tab=impayes&relance=999');
    rendre();

    await waitFor(() => expect(titres()).toEqual(['Cette échéance ne figure pas parmi les impayés à relancer.']));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByRole('article', { name: 'Locataire 77' })).toBeInTheDocument();
  });

  it('une RÉSERVATION du même identifiant n’ouvre rien : seules les échéances de bail se relancent', async () => {
    navigationDeTest.reinitialiser('tab=impayes&relance=90');
    rendre();

    await waitFor(() => expect(titres()).toEqual(['Cette échéance ne figure pas parmi les impayés à relancer.']));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('une valeur qui n’est ni un identifiant ni `file` n’ouvre rien et ne lit rien', async () => {
    navigationDeTest.reinitialiser('tab=impayes&relance=abc');
    rendre();

    await waitFor(() => expect(titres()).toEqual(['Cette échéance ne figure pas parmi les impayés à relancer.']));
    expect(lecturesDeLaFile()).toEqual([]);
    expect(navigationDeTest.requete()).toBe('tab=impayes');
  });

  it('une lecture en panne le dit, sans rien ouvrir', async () => {
    reseau.panne = true;
    navigationDeTest.reinitialiser('tab=impayes&relance=77');
    rendre();

    await waitFor(() => expect(titres()).toEqual(['Les échéances n’ont pas pu être lues. Réessayez.']));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('TCK-2775 — `?relance=file`', () => {
  it('AC2 — ouvre la file sur l’échéance de bail la plus en retard ; la réservation n’y entre pas', async () => {
    navigationDeTest.reinitialiser('tab=impayes&relance=file');
    rendre();

    // La position se dit deux fois (sous-titre, et en tête du panneau à `xl`).
    expect((await screen.findAllByText('1 sur 3')).length).toBeGreaterThan(0);
    expect(screen.getByRole('dialog', { name: /Locataire 91/ })).toBeInTheDocument();
    expect(screen.queryByText(/Locataire 90/, { selector: '[role="dialog"] *' })).toBeNull();
    expect(nonGet()).toEqual([]);
  });

  it('aucune échéance de bail : rien ne s’ouvre, l’écran le dit', async () => {
    lignes = [ligne(90, 60, { source: 'booking', lease_id: null })];
    navigationDeTest.reinitialiser('tab=impayes&relance=file');
    rendre();

    await waitFor(() => expect(titres()).toEqual(['Aucune échéance de bail à relancer.']));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('au plafond de l’API (100) : la file part, et l’écran dit qu’elle s’arrête là', async () => {
    lignes = Array.from({ length: 120 }, (_, i) => ligne(i + 1, 200 - i));
    navigationDeTest.reinitialiser('tab=impayes&relance=file');
    rendre();

    expect((await screen.findAllByText('1 sur 100')).length).toBeGreaterThan(0);
    expect(titres()).toEqual(['La file s’arrête aux 100 échéances les plus en retard']);
  });
});

describe('TCK-2775 — AC4 : la demande quitte l’adresse', () => {
  it('après lecture, l’adresse ne porte plus `relance` ni `bail` (remplacée, pas empilée) ; un retour ne rouvre rien', async () => {
    navigationDeTest.reinitialiser('tab=impayes&period=2026-11&relance=77&bail=177');
    const { unmount } = rendre();

    await screen.findByRole('dialog', { name: 'Relancer Locataire 77' });
    expect(navigationDeTest.requete()).toBe('tab=impayes&period=2026-11');
    expect(navigationDeTest.replace).toHaveBeenCalledTimes(1);
    expect(navigationDeTest.replace).toHaveBeenCalledWith('/?tab=impayes&period=2026-11');
    expect(navigationDeTest.push).not.toHaveBeenCalled();

    // L'entrée d'historique est celle que le remplacement a laissée : y revenir remonte l'écran SANS demande.
    unmount();
    reseau.appels.length = 0;
    rendre();
    await screen.findByRole('article', { name: 'Locataire 77' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(lecturesDeLaFile()).toEqual([]);
  });

  it('le retrait PRÉCÈDE l’entrée sentinelle de la file (`useFermeAuRetour`) : le geste retour la ferme, au lieu d’un remplacement qui l’effaçait', async () => {
    const empile = vi.spyOn(window.history, 'pushState');
    try {
      navigationDeTest.reinitialiser('tab=impayes&relance=file');
      rendre();
      expect((await screen.findAllByText('1 sur 3')).length).toBeGreaterThan(0);
      await waitFor(() => expect(empile).toHaveBeenCalled());
      const retrait = vi.mocked(window.history.replaceState).mock.invocationCallOrder[0]!;
      expect(retrait).toBeLessThan(empile.mock.invocationCallOrder[0]!);
      expect(vi.mocked(window.history.replaceState)).toHaveBeenCalledTimes(1);
    } finally {
      empile.mockRestore();
    }
  });
});

describe('TCK-2818 AC1 — depuis la fiche du bail, la relance de l’écran : le même message, le même lien, la même note', () => {
  it('`relance=77&bail=177` → « Ouvrir WhatsApp » : `wa.me` au numéro du locataire, le mois, le montant et le lien de paiement ; `POST …/reminders {channel: whatsapp}`', async () => {
    const fenetres: { opener: unknown; location: { href: string }; close: () => void }[] = [];
    const ouvrir = vi.spyOn(window, 'open').mockImplementation(() => {
      const f = { opener: {}, location: { href: '' }, close: () => undefined };
      fenetres.push(f);
      return f as unknown as Window;
    });
    try {
      navigationDeTest.reinitialiser('tab=impayes&relance=77&bail=177');
      rendre();
      const feuille = await screen.findByRole('dialog', { name: 'Relancer Locataire 77' });
      expect(await within(feuille).findByText(/\[lien de paiement ajouté à l’envoi\]/)).toBeInTheDocument();
      expect(nonGet()).toEqual([]);

      await userEvent.setup().click(within(feuille).getByRole('button', { name: /Ouvrir WhatsApp/ }));

      await waitFor(() => expect(fenetres.filter((f) => f.location.href !== '')).toHaveLength(1));
      const href = new URL(fenetres[0]!.location.href);
      expect(`${href.origin}${href.pathname}`).toBe('https://wa.me/221771234567');
      const texte = href.searchParams.get('text')!;
      expect(texte).toMatch(/^Bonjour Prénom77, le loyer d’octobre/);
      expect(texte).toContain('250');
      expect(texte).toContain(LIEN_DE_PAIEMENT);
      await waitFor(() =>
        expect(nonGet().map((a) => [a.methode, a.chemin, a.corps])).toEqual([
          ['POST', '/api/lease-payments/77/payment-link', {}],
          ['POST', '/api/lease-payments/77/reminders', { channel: 'whatsapp' }],
        ]),
      );
    } finally {
      ouvrir.mockRestore();
    }
  });
});

