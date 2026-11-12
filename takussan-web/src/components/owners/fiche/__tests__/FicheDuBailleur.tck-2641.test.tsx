import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import type { OwnerProfileDetail } from '@/lib/queries/owners';
import type { PropertyListItem } from '@/types/property';
import { withIntl } from '@/test/intl';
import { FicheDuBailleur, type DroitsSurLaFiche, type FicheDuBailleurProps } from '../FicheDuBailleur';

/**
 * TCK-2641 — la fiche d'un bailleur : « Reste à verser » tel que l'API le rend (le relevé du mois),
 * le mois nommé dans la langue de l'application et choisi par pas (jamais `type="month"`), le
 * plafond de travaux écrit par `PATCH` ou lu seulement, la suspension de l'accès sous la garde du
 * second facteur, et le reversement ouvert sur ce bailleur et ce mois.
 */
const replace = vi.fn();
const refresh = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push, refresh }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/app/owners/5',
}));
const apiRequest = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, token: 'jeton', isLoading: false }) }));
const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));
const RECU = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock('@/components/payments/CreatePayoutDialog', () => ({
  CreatePayoutDialog: (props: Record<string, unknown>) => {
    RECU.props = props;
    return props.open ? <p>dialogue du reversement</p> : null;
  },
}));
vi.mock('@/components/messages/BrouillonDirect', () => ({ BrouillonDirect: () => <p>brouillon direct</p> }));

const vide = { data: [], meta: { total: 0, current_page: 1, last_page: 1, per_page: 20 }, links: {} };

function owner(surcharges: Partial<OwnerProfileDetail> = {}): OwnerProfileDetail {
  return {
    id: 5, user_id: 9, agency_id: 7, status: 'active', joined_at: '2024-03-10T00:00:00Z',
    owner_type: 'individual', company_name: null,
    contact: { first_name: 'Mouhamed', last_name: 'Sène', full_name: 'Mouhamed Sène', email: 'm.sene@example.test', phone: '+221703757526' },
    pending_invitation_id: null, properties_count: 7, occupied_properties_count: 6,
    figures: { period: '2026-11', currency: 'XOF', collected: 11437597, commission: 1143760, paid_out: 7176468, remaining_to_pay: 3117369 } as never,
    last_payout: { id: 3, processed_at: '2026-11-05T10:00:00Z', net_amount: 7176468, payment_method: 'wave' },
    next_payout: null, works_approval_threshold: 100000, agency_commission_rate: 10, lease_commission_rates: [],
    rib_masked: null, tax_id_masked: null, id_document_number_masked: null,
    ...surcharges,
  };
}

const tous: DroitsSurLaFiche = { plafond: true, reversement: true, suspension: true, sensible: true };

function monter(props: Partial<FicheDuBailleurProps> = {}, { locale = 'fr' as 'fr' | 'en', garde = null as GardeDoubleFacteurFn | null } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(
    <QueryClientProvider client={client}>
      <ContexteGardeDoubleFacteur.Provider value={garde}>
        <FicheDuBailleur owner={owner()} period="2026-11" moisCourant="2026-11" biens={[]} agencyId={7} droits={tous} {...props} />
      </ContexteGardeDoubleFacteur.Provider>
    </QueryClientProvider>,
    locale,
  ));
}

// `useFormatteurs().montant` sépare les milliers par une espace insécable étroite.
const montant = (n: string) => new RegExp(n.replace(/ /g, '[\\s\\u202f\\u00a0]'));
const releve = () => within(document.querySelector('[data-slot="releve-du-mois"]') as HTMLElement);

beforeEach(() => {
  replace.mockReset();
  refresh.mockReset();
  push.mockReset();
  toastAdd.mockReset();
  RECU.props = null;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async () => vide);
});

describe('TCK-2641 — la fiche du bailleur', () => {
  it('« Reste à verser » est celui de l’API, puis encaissé, commission et déjà versé', () => {
    monter();
    expect(document.querySelector('[data-slot="reste-a-verser"]')).toHaveTextContent(montant('3 117 369'));
    expect(document.querySelector('[data-slot="reste-a-verser-bureau"]')).toHaveTextContent(montant('3 117 369'));
    expect(releve().getAllByText(montant('11 437 597')).length).toBeGreaterThan(0);
    expect(releve().getAllByText(montant('− 1 143 760')).length).toBeGreaterThan(0);
    expect(releve().getAllByText('Déjà versé le 5 nov.').length).toBeGreaterThan(0);
  });

  it('le mois se nomme dans la langue de l’application, sans champ type="month"', () => {
    const { unmount } = monter();
    expect(releve().getAllByText('novembre 2026').length).toBeGreaterThan(0);
    expect(document.querySelector('input[type="month"]')).toBeNull();
    unmount();
    monter({}, { locale: 'en' });
    expect(releve().getAllByText('November 2026').length).toBeGreaterThan(0);
  });

  it('le mois se choisit par pas : jamais au-delà du mois en cours, qui ne s’écrit pas dans l’URL', async () => {
    const user = userEvent.setup();
    const { unmount } = monter();
    expect(screen.getByRole('button', { name: 'Mois suivant' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Mois précédent' }));
    expect(replace).toHaveBeenLastCalledWith('?period=2026-10', { scroll: false });
    unmount();
    monter({ period: '2026-10' });
    await user.click(screen.getByRole('button', { name: 'Mois suivant' }));
    expect(replace).toHaveBeenLastCalledWith('?', { scroll: false });
  });

  it('le plafond de travaux s’écrit par PATCH sous owners.update', async () => {
    const user = userEvent.setup();
    monter();
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    const champ = screen.getByRole('textbox', { name: /Travaux sans accord jusqu’à/ });
    await user.clear(champ);
    await user.type(champ, '150000');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/owners/5', expect.objectContaining({ method: 'PATCH', body: { works_approval_threshold: 150000 } })));
    expect(refresh).toHaveBeenCalled();
  });

  it('sans owners.update, le plafond se lit et ne se modifie pas', () => {
    monter({ droits: { ...tous, plafond: false } });
    expect(document.querySelector('[data-slot="plafond-de-travaux"]')).toHaveTextContent(montant('100 000'));
    expect(screen.queryByRole('button', { name: 'Modifier' })).not.toBeInTheDocument();
  });

  it('« Créer le reversement » ouvre le dialogue sur ce bailleur et ce mois', async () => {
    const user = userEvent.setup();
    monter({ period: '2026-09', moisCourant: '2026-11' });
    await user.click(screen.getAllByRole('button', { name: 'Créer le reversement' })[0] as HTMLElement);
    expect(screen.getByText('dialogue du reversement')).toBeInTheDocument();
    expect(RECU.props).toMatchObject({ open: true, bailleurInitial: 9, periodeInitiale: { du: '2026-09-01', au: '2026-09-30' } });
  });

  it('un accès suspendu, ou sans payouts.create, n’a pas de reversement', () => {
    const { unmount } = monter({ owner: owner({ status: 'blocked' }) });
    expect(screen.queryByRole('button', { name: 'Créer le reversement' })).not.toBeInTheDocument();
    unmount();
    monter({ droits: { ...tous, reversement: false } });
    expect(screen.queryByRole('button', { name: 'Créer le reversement' })).not.toBeInTheDocument();
  });

  it('« Suspendre l’accès » confirme, passe la garde du second facteur et rejoue l’appel', async () => {
    let appels = 0;
    apiRequest.mockImplementation(async (chemin: string) => {
      if (!chemin.endsWith('/suspend')) return vide;
      appels += 1;
      if (appels === 1) throw new ApiError(403, { code: 'two_factor_step_up_required' });
      return { data: {} };
    });
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
    const user = userEvent.setup();
    monter({}, { garde });
    await user.click(screen.getByRole('button', { name: 'Suspendre l’accès' }));
    await user.click(await screen.findByRole('button', { name: 'Suspendre' }));
    await waitFor(() => expect(appels).toBe(2));
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    expect(apiRequest).toHaveBeenCalledWith('/api/agencies/7/team/9/suspend', expect.objectContaining({ method: 'POST' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('un accès suspendu se réactive ; sans team.suspend, la section n’existe pas', async () => {
    const user = userEvent.setup();
    const { unmount } = monter({ owner: owner({ status: 'blocked' }) });
    await user.click(screen.getByRole('button', { name: 'Réactiver' }));
    await user.click(await screen.findByRole('button', { name: 'Réactiver' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/agencies/7/team/9/reactivate', expect.objectContaining({ method: 'POST' })));
    unmount();
    monter({ droits: { ...tous, suspension: false } });
    expect(document.querySelector('[data-slot="acces-et-depart"]')).toBeNull();
  });

  it('« Appeler » et « WhatsApp » visent le numéro du compte', () => {
    monter();
    expect(screen.getByRole('link', { name: 'Appeler Mouhamed Sène' })).toHaveAttribute('href', 'tel:+221703757526');
    expect(screen.getByRole('link', { name: 'Écrire à Mouhamed Sène sur WhatsApp' }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/221703757526\?text=/);
  });
});

const VILLA = {
  id: 41, title: 'Villa 4 chambres', contract_type: 'rent', rent_period: 'monthly', price: 2_150_000, currency: 'XOF', main_photo_url: null,
  location: { quarter: 'Almadies', city: 'Dakar', region: null, country: 'SN', latitude: null, longitude: null },
  occupancy: {
    state: 'occupied', vacant_since: null,
    lease: { id: 7, reference_number: 'LS-7', type: 'residential_rent', status: 'active', start_date: '2026-01-01', end_date: '2027-12-31' },
    tenant: { id: 4, first_name: 'Fatou', last_name: 'Sarr', phone: null },
    rent: { amount: 2_150_000, charges: null, currency: 'XOF', payment_frequency: 'monthly' },
    current_month: { status: 'paid', due_date: '2026-11-05', days_late: null, amount_due: 2_150_000, late_fee_outstanding: null },
  },
} as unknown as PropertyListItem;

describe('TCK-2641 — les biens, les reversements et « Message »', () => {
  it('chaque bien dit son lieu, son locataire et son mois, et mène à sa fiche', () => {
    monter({ biens: [VILLA] });
    const carte = within(document.querySelector('[aria-labelledby="biens-du-bailleur"]') as HTMLElement);
    expect(carte.getByRole('heading', { name: 'Ses biens (7)' })).toBeInTheDocument();
    expect(carte.getByText('Almadies · Fatou Sarr')).toBeInTheDocument();
    const rangee = within(carte.getByRole('table').querySelector('tbody tr') as HTMLElement);
    expect(rangee.getByRole('link', { name: 'Villa 4 chambres · Almadies' })).toHaveAttribute('href', '/app/properties/41');
    expect(rangee.getByText('Fatou Sarr')).toBeInTheDocument();
    expect(carte.getByRole('link', { name: 'Voir dans Biens' })).toHaveAttribute('href', '/app/properties?mode=gestion&user_id=9');
  });

  it('les derniers reversements au bailleur : sa période, son montant, son statut', async () => {
    apiRequest.mockImplementation(async (chemin: string) => (chemin.startsWith('/api/payouts')
      ? { ...vide, data: [{ id: 3, status: 'completed', period_start: '2026-11-01', processed_at: '2026-11-05T10:00:00Z', scheduled_at: null, created_at: '2026-11-05T10:00:00Z', net_amount: 7469771, currency: 'XOF' }] }
      : vide));
    monter();
    await screen.findByText('Reversement de novembre');
    const liste = within(document.querySelector('[data-slot="derniers-reversements"]') as HTMLElement);
    expect(liste.getByText('Reversement de novembre')).toBeInTheDocument();
    expect(liste.getByText(montant('7 469 771'))).toBeInTheDocument();
    expect(liste.getByText('Effectué')).toBeInTheDocument();
    expect(decodeURIComponent(String(apiRequest.mock.calls.find(([c]) => String(c).startsWith('/api/payouts'))?.[0]))).toContain('filter[landlord_id]=9');
  });

  it('« Message » ouvre le fil à deux qui existe, sinon un brouillon', async () => {
    const user = userEvent.setup();
    apiRequest.mockImplementation(async () => vide);
    monter();
    await user.click(screen.getAllByRole('button', { name: 'Message' })[0] as HTMLElement);
    expect(await screen.findByText('brouillon direct')).toBeInTheDocument();
    expect(screen.getByText('Message à Mouhamed Sène')).toBeInTheDocument();
    expect(String(apiRequest.mock.calls.find(([c]) => String(c).startsWith('/api/conversations'))?.[0])).toContain('participant');
    expect(push).not.toHaveBeenCalled();
  });
});
