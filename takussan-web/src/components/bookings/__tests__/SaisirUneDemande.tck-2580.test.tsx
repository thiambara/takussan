/**
 * TCK-2580 (ADR-0102) — « Saisir une demande » : la nature déduite du bien, l'autre désactivée ; le
 * corps RÉELLEMENT envoyé (lu sur la requête `fetch`, pas sur un espion de mutation) pour une
 * candidature et pour une offre ; les deux formes de 422 posées sur leur champ ; l'entrée absente
 * pour un bailleur.
 *
 * Les fixtures ont la forme des réponses de l'API servie (relevé du 2026-11-11, compte agent de
 * l'agence de démo) : `GET /api/properties/{id}` et `GET /api/me/profiles`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import { SaisirUneDemande } from '../SaisirUneDemande';
import { EntreeSaisieDemande } from '../EntreeSaisieDemande';
import profilsAgent from '@/components/visits/__tests__/fixtures/r2-profils-agent.json';
import profilsBailleur from '@/components/visits/__tests__/fixtures/r2-profils-bailleur.json';

const pousser = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pousser, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/app/bookings',
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 3 }, token: 'jeton', isLoading: false }) }));
const profils = vi.hoisted(() => ({ courant: null as unknown }));
vi.mock('@/hooks/useProfiles', () => ({ useMyProfiles: () => ({ data: profils.courant }) }));
vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({ id, value, onValueChange, placeholder }: { id?: string; value?: string; onValueChange: (v: string) => void; placeholder?: string }) => (
    <input id={id} placeholder={placeholder} value={value ?? ''} onChange={(e) => onValueChange(e.target.value)} />
  ),
}));

const STUDIO = {
  id: 40,
  title: 'Studio meublé · Mermoz',
  price: 250000,
  currency: 'XOF',
  contract_type: 'rent',
  rent_period: 'monthly',
  main_photo_url: null,
};
const VILLA = { id: 41, title: 'Villa · Almadies', price: 95000000, currency: 'XOF', contract_type: 'sale', rent_period: null, main_photo_url: null };
const DUPLEX = { id: 42, title: 'Duplex · Ngor', price: 55000, currency: 'XOF', contract_type: 'rent', rent_period: 'daily', main_photo_url: null };
const BIENS: Record<number, typeof STUDIO | typeof VILLA | typeof DUPLEX> = { 40: STUDIO, 41: VILLA, 42: DUPLEX };

interface Envoi {
  readonly url: string;
  readonly corps: Record<string, unknown>;
}
const envois: Envoi[] = [];
let reponseDuPost: { status: number; corps: unknown } = { status: 201, corps: { data: { id: 901 } } };
/** m1 — les biens que la recherche sert, bornés par `filter[agency_id]` comme l'API (`null` : STUDIO et VILLA). */
let biensCherches: ({ readonly agency_id: number } & Record<string, unknown>)[] | null = null;
const recherchesDeBiens: URL[] = [];

function json(status: number, corps: unknown) {
  return Promise.resolve(new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } }));
}

beforeEach(() => {
  envois.length = 0;
  pousser.mockReset();
  profils.courant = profilsAgent;
  reponseDuPost = { status: 201, corps: { data: { id: 901 } } };
  biensCherches = null;
  recherchesDeBiens.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((entree: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(entree), 'http://api.test');
      if ((init?.method ?? 'GET') === 'POST' && url.pathname === '/api/bookings') {
        envois.push({ url: url.pathname, corps: JSON.parse(String(init?.body)) as Record<string, unknown> });
        return json(reponseDuPost.status, reponseDuPost.corps);
      }
      const detail = /^\/api\/properties\/(\d+)$/.exec(url.pathname);
      if (detail) return json(200, { data: BIENS[Number(detail[1])] });
      if (url.pathname === '/api/properties') {
        recherchesDeBiens.push(url);
        if (biensCherches === null) return json(200, { data: [STUDIO, VILLA], meta: { total: 2 } });
        const agence = url.searchParams.get('filter[agency_id]');
        const servis = biensCherches.filter((b) => agence === null || String(b.agency_id) === agence);
        return json(200, { data: servis, meta: { total: servis.length } });
      }
      if (url.pathname === '/api/customers') {
        return json(200, { data: [{ id: 269, first_name: 'Bineta', last_name: 'Ndoye', email: null, phone: '+221770000000' }], meta: { total: 1 } });
      }
      return json(404, {});
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function monter(ui: React.ReactElement) {
  return render(
    withIntl(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

const BINETA = { id: 269, nom: 'Bineta Ndoye', detail: 'Repris de sa visite' };

async function feuille() {
  return screen.findByRole('dialog', { name: 'Saisir une demande' });
}

describe('TCK-2580 — la nature se déduit du bien', () => {
  it('location au mois : « Candidature » cochée, « Offre d’achat » désactivée, et la raison dite', async () => {
    monter(<SaisirUneDemande open onOpenChange={() => {}} client={BINETA} bien={{ id: 40, titre: 'Studio meublé · Mermoz' }} />);
    const d = await feuille();
    const candidature = await within(d).findByRole('radio', { name: 'Candidature' });
    await waitFor(() => expect(candidature).toHaveAttribute('aria-checked', 'true'));
    const offre = within(d).getByRole('radio', { name: 'Offre d’achat' });
    expect(offre).toHaveAttribute('aria-disabled', 'true');
    expect(within(d).getByText('Ce bien est à louer : la demande est une candidature.')).toBeInTheDocument();
    // Le loyer affiché sert de valeur par défaut, groupé ; l'unité est dans le champ.
    expect(within(d).getByLabelText('Loyer proposé')).toHaveValue(new Intl.NumberFormat('fr-FR').format(250000));
    expect(within(d).getByText('F/mois')).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: 'Enregistrer la candidature' })).toBeInTheDocument();
  });

  it('bien à vendre : « Offre d’achat » cochée, « Candidature » désactivée', async () => {
    monter(<SaisirUneDemande open onOpenChange={() => {}} client={BINETA} bien={{ id: 41 }} />);
    const d = await feuille();
    await waitFor(() => expect(within(d).getByRole('radio', { name: 'Offre d’achat' })).toHaveAttribute('aria-checked', 'true'));
    expect(within(d).getByRole('radio', { name: 'Candidature' })).toHaveAttribute('aria-disabled', 'true');
    expect(within(d).getByRole('button', { name: 'Enregistrer l’offre' })).toBeInTheDocument();
  });

  it('location à la nuit : aucune des deux, la raison, et rien à enregistrer', async () => {
    monter(<SaisirUneDemande open onOpenChange={() => {}} client={BINETA} bien={{ id: 42 }} />);
    const d = await feuille();
    expect(await within(d).findByText(/un séjour se réserve depuis son calendrier/)).toBeInTheDocument();
    for (const nom of ['Candidature', 'Offre d’achat']) {
      expect(within(d).getByRole('radio', { name: nom })).toHaveAttribute('aria-checked', 'false');
    }
    expect(within(d).getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  });
});

describe('TCK-2580 — le corps envoyé, lu sur la requête', () => {
  it('AC1 — candidature : kind, client, bien, loyer par défaut, date d’entrée ; rien de ce que l’API interdit', async () => {
    const user = userEvent.setup();
    monter(<SaisirUneDemande open onOpenChange={() => {}} client={BINETA} bien={{ id: 40 }} />);
    const d = await feuille();
    await waitFor(() => expect(within(d).getByLabelText('Loyer proposé')).toHaveValue(new Intl.NumberFormat('fr-FR').format(250000)));
    await user.type(within(d).getByLabelText(/Date d’entrée/), '2026-12-01');
    await user.type(within(d).getByLabelText('Message'), 'Elle confirme après la visite.');
    await user.click(within(d).getByRole('button', { name: 'Enregistrer la candidature' }));

    await waitFor(() => expect(envois).toHaveLength(1));
    expect(envois[0]!.corps).toEqual({
      kind: 'application',
      property_id: 40,
      customer_id: 269,
      total_amount: 250000,
      start_date: '2026-12-01',
      notes: 'Elle confirme après la visite.',
    });
    // Succès : la réservation créée s'ouvre.
    await waitFor(() => expect(pousser).toHaveBeenCalledWith('/app/bookings/901'));
  });

  it('AC2 — offre de 85 M sur 95 M affichés : « −10,5 % », et le montant libre part tel quel', async () => {
    const user = userEvent.setup();
    const apres = vi.fn();
    monter(<SaisirUneDemande open onOpenChange={() => {}} client={BINETA} bien={{ id: 41 }} onSuccess={apres} />);
    const d = await feuille();
    const champ = await within(d).findByLabelText(/Montant offert/);
    await waitFor(() => expect(champ).toHaveValue(new Intl.NumberFormat('fr-FR').format(95000000)));
    // La place réservée à l'unité suit l'unité : « F » ne rogne pas un montant à neuf chiffres (mesuré à 390 px).
    expect(champ.style.paddingInlineEnd).toBe('calc(1ch + 1.25rem)');
    await user.clear(champ);
    await user.type(champ, '85000000');
    const ecart = within(d).getByText(/par rapport au prix affiché/);
    // Le signe moins d'`Intl` (U+2212 ou U+002D selon le moteur) : on lit le nombre.
    expect(ecart.textContent).toMatch(/^[−-]10,5\s%/);
    await user.click(within(d).getByRole('button', { name: 'Enregistrer l’offre' }));

    await waitFor(() => expect(envois).toHaveLength(1));
    expect(envois[0]!.corps).toEqual({ kind: 'offer', property_id: 41, customer_id: 269, total_amount: 85000000 });
    // Une offre n'envoie ni date d'entrée ni fin (l'API les interdit).
    expect(envois[0]!.corps).not.toHaveProperty('start_date');
    // `onSuccess` remplace l'ouverture de la réservation (la suite d'une visite, TCK-2581).
    await waitFor(() => expect(apres).toHaveBeenCalledWith(expect.objectContaining({ id: 901 })));
    expect(pousser).not.toHaveBeenCalled();
  });

  it('sans client : la recherche, puis le choix, puis l’envoi à son nom', async () => {
    const user = userEvent.setup();
    monter(<SaisirUneDemande open onOpenChange={() => {}} bien={{ id: 41 }} />);
    const d = await feuille();
    await user.click(await within(d).findByRole('button', { name: 'Enregistrer l’offre' }));
    expect(within(d).getByText('Choisissez le client.')).toBeInTheDocument();
    expect(envois).toHaveLength(0);
    await user.type(within(d).getByRole('searchbox', { name: 'Client' }), 'Bineta');
    await user.click(await within(d).findByRole('button', { name: /Bineta Ndoye/ }));
    expect(within(d).getByRole('button', { name: 'Changer de client' })).toBeInTheDocument();
    await user.click(within(d).getByRole('button', { name: 'Enregistrer l’offre' }));
    await waitFor(() => expect(envois).toHaveLength(1));
    expect(envois[0]!.corps).toMatchObject({ customer_id: 269, kind: 'offer' });
  });
});

describe('TCK-2580 — les erreurs 422 sur leur champ', () => {
  it('`booking.customer_required` (corps {code}) se pose sous « Client », en texte du front', async () => {
    const user = userEvent.setup();
    reponseDuPost = { status: 422, corps: { code: 'booking.customer_required', message: 'Une réservation saisie…' } };
    monter(<SaisirUneDemande open onOpenChange={() => {}} client={BINETA} bien={{ id: 41 }} />);
    const d = await feuille();
    await user.click(await within(d).findByRole('button', { name: 'Enregistrer l’offre' }));
    const alerte = await within(d).findByText(/une demande saisie par l’agence est toujours à son nom/);
    // Sous le libellé « Client » : le même bloc de champ.
    expect(alerte.closest('div')).toHaveTextContent('Client');
    expect(pousser).not.toHaveBeenCalled();
  });

  it('`booking.kind_mismatch` se pose sous « Nature » ; une erreur de validation du montant, sous le montant', async () => {
    const user = userEvent.setup();
    reponseDuPost = {
      status: 422,
      corps: { message: 'Données invalides.', errors: { total_amount: ['Le montant doit être supérieur à 0.'] } },
    };
    monter(<SaisirUneDemande open onOpenChange={() => {}} client={BINETA} bien={{ id: 41 }} />);
    let d = await feuille();
    await user.click(await within(d).findByRole('button', { name: 'Enregistrer l’offre' }));
    const montant = await within(d).findByText('Le montant doit être supérieur à 0.');
    expect(montant.parentElement).toHaveTextContent('Montant offert');

    reponseDuPost = { status: 422, corps: { code: 'booking.kind_mismatch', message: '…' } };
    await user.click(within(d).getByRole('button', { name: 'Enregistrer l’offre' }));
    d = await feuille();
    const nature = await within(d).findByText(/Cette nature ne correspond pas au bien/);
    expect(nature.parentElement).toHaveTextContent('Nature');
  });
});

describe('TCK-2580 — l’entrée, au personnel seulement (AC4)', () => {
  it('l’agent actif a l’entrée sur la page Réservations et sur la fiche client', () => {
    monter(
      <>
        <EntreeSaisieDemande variante="reservations" />
        <EntreeSaisieDemande variante="fiche" client={BINETA} />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Saisir une demande' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saisir une candidature ou une offre' })).toBeInTheDocument();
  });

  it('le bailleur ne l’a ni sur la page Réservations ni sur la fiche client (DOM)', () => {
    profils.courant = profilsBailleur;
    const { container } = monter(
      <>
        <EntreeSaisieDemande variante="reservations" />
        <EntreeSaisieDemande variante="fiche" client={BINETA} />
      </>,
    );
    expect(screen.queryByRole('button', { name: /Saisir/ })).toBeNull();
    expect(container.textContent).not.toMatch(/Saisir/);
  });

  it('fermée, la feuille rend le focus au bouton qui l’a ouverte', async () => {
    const user = userEvent.setup();
    monter(<EntreeSaisieDemande variante="fiche" client={BINETA} />);
    const bouton = screen.getByRole('button', { name: 'Saisir une candidature ou une offre' });
    await user.click(bouton);
    const d = await feuille();
    await user.click(within(d).getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(bouton).toHaveFocus();
  });
});

describe('TCK-2580 — vérification adverse, m1 : la recherche du bien, bornée à l’agence du personnel', () => {
  // Un compte double : agent ACTIF de l'agence 2, et bailleur d'un bien de l'agence 1.
  const PROFILS_DU_DOUBLE = {
    data: [
      { id: 'agent:9', type: 'agent', numeric_id: 9, agency_id: 2, agency: { id: 2, name: 'Agence B', slug: 'agence-b', kind: 'standard' }, status: 'active', created_at: '2026-10-07T22:39:28+00:00' },
      { id: 'owner:4', type: 'owner', numeric_id: 4, agency_id: 1, agency: { id: 1, name: 'Agence A', slug: 'agence-a', kind: 'standard' }, status: 'active', created_at: '2026-10-07T22:39:28+00:00' },
    ],
    meta: { active_profile_id: 'agent:9', count: 2 },
  };
  const BIEN_DE_B = { id: 50, title: 'Appartement · Point E', price: 300000, currency: 'XOF', contract_type: 'rent', rent_period: 'monthly', main_photo_url: null, agency_id: 2 };
  const BIEN_DU_DOUBLE = { id: 51, title: 'Maison du double · Yoff', price: 200000, currency: 'XOF', contract_type: 'rent', rent_period: 'monthly', main_photo_url: null, agency_id: 1 };

  it('sous son profil agent de B, il ne se voit pas proposer son propre bien de A, que l’API refuserait', async () => {
    profils.courant = PROFILS_DU_DOUBLE;
    biensCherches = [BIEN_DE_B, BIEN_DU_DOUBLE];
    monter(<SaisirUneDemande open onOpenChange={() => {}} client={BINETA} />);
    const d = await feuille();

    expect(await within(d).findByRole('button', { name: /Appartement · Point E/ })).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: /Maison du double/ })).not.toBeInTheDocument();
    expect(recherchesDeBiens.length).toBeGreaterThan(0);
    expect(recherchesDeBiens.every((u) => u.searchParams.get('filter[agency_id]') === '2')).toBe(true);
  });
});
