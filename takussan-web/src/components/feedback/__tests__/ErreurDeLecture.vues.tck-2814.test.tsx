/**
 * TCK-2814 — les vues d'un objet unique et leurs sous-blocs distinguent la panne, l'objet introuvable
 * et le refus : une panne (5xx, réseau) propose « Réessayer », un 403 ou un 404 ne le propose jamais
 * et dit pourquoi. La règle vit en un point (`natureDeLErreur`), que chaque ligne ci-dessous traverse.
 *
 * Une ligne par lieu d'erreur, nommée. Chaque lecture est la VRAIE (hooks de requête → `fetch`) sur un
 * `fetch` doublé : la requête visée répond le statut éprouvé, toutes les autres restent EN ATTENTE —
 * leurs blocs restent en chargement, et aucun autre bloc d'erreur ne vient brouiller l'assertion.
 */
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { CustomerDetail } from '@/types/customer';
import type { LeaseGuarantor, LeaseWithRelations } from '@/lib/queries/leases';
import type { PropertyDetail } from '@/types/property';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton-du-lecteur', isLoading: false, isAuthenticated: true }),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/app',
}));
vi.mock('@/components/ui/toast', async (original) => ({
  ...(await original<typeof import('@/components/ui/toast')>()),
  useToast: () => ({ add: vi.fn() }),
}));

import { OngletDocumentsDuBail, OngletHistoriqueDuBail } from '@/components/leases/fiche/OngletsDuBail';
import { OngletLocation } from '@/components/property-dashboard/fiche/OngletLocation';
import { OngletDocuments, useDocumentsDuBien } from '@/components/property-dashboard/fiche/OngletDocuments';
import { FeuilleDesGarants } from '@/components/leases/fiche/FeuilleDesGarants';
import { LeaseSchedule } from '@/components/leases/LeaseSchedule';
import { VersionsDuDocument } from '@/components/documents/fiche/VersionsDuDocument';
import { FilDuClient } from '@/components/customer-dashboard/fiche/FilDuClient';
import { PropertyModerationDetail } from '@/components/admin/PropertyModerationDetail';
import { UserDetailPage } from '@/components/admin/super/user-detail';
import { AdminCreditWalletDetail } from '@/components/boost/admin/AdminCreditWalletDetail';

const BAIL = { id: 4, currency: 'XOF', abilities: {} } as unknown as LeaseWithRelations;
const BIEN = {
  id: 9,
  title: 'Villa 5 chambres · Ouest Foire',
  contract_type: 'rent',
  rent_period: 'monthly',
  price: 1_355_000,
  currency: 'XOF',
  photos: [],
  price_history: [],
  owner: { id: 50, name: 'Mouhamed Sène' },
  owner_profile_id: 31,
  agency: { id: 3, name: 'Agence Teranga' },
  is_online: false,
  occupancy: {
    state: 'occupied',
    vacant_since: null,
    lease: { id: 7, reference_number: 'LS-7KQ2', type: 'residential_rent', status: 'active', start_date: '2026-07-01', end_date: '2029-06-30' },
    tenant: { id: 3, first_name: 'Mariama', last_name: 'Sow', phone: '+221776124085' },
    rent: { amount: 1_355_000, charges: null, currency: 'XOF', payment_frequency: 'monthly' },
    current_month: null,
  },
} as unknown as PropertyDetail;
const GARANT = {
  id: 2,
  first_name: 'Ousmane',
  last_name: 'Seck',
  phone: '+221770000002',
  email: 'o@exemple.sn',
  role: null,
  can_edit: true,
  id_on_file: true,
  leases_count: 1,
} as LeaseGuarantor;
const CLIENT = { id: 7, first_name: 'Mouhamed', last_name: 'Dieng' } as CustomerDetail;

function DocumentsDuBien() {
  const documents = useDocumentsDuBien(BIEN);
  return <OngletDocuments property={BIEN} documents={documents} />;
}

interface Ligne {
  readonly vue: string;
  /** La requête qui répond le statut éprouvé ; les autres restent en attente. */
  readonly cible: RegExp;
  readonly rendre: () => ReactNode;
  /** Un geste avant que la lecture parte (la fiche d'un garant s'ouvre par « Modifier »). */
  readonly avant?: () => Promise<void>;
}

const LIGNES: readonly Ligne[] = [
  { vue: 'OngletsDuBail · Documents', cible: /\/api\/documents(\?|$)/, rendre: () => <OngletDocumentsDuBail lease={BAIL} nom="Bail LS-7KQ2" /> },
  { vue: 'OngletsDuBail · Historique', cible: /\/api\/audit-log\/lease\/4(\?|$)/, rendre: () => <OngletHistoriqueDuBail lease={BAIL} /> },
  {
    vue: 'OngletLocation · échéances',
    cible: /\/api\/payments\/history(\?|$)/,
    rendre: () => <OngletLocation property={BIEN} personnel={false} lienVersLeBailleur={false} onOuvrirLAnnonce={() => {}} />,
  },
  {
    vue: 'OngletLocation · bail',
    cible: /\/api\/leases\/7(\?|$)/,
    rendre: () => <OngletLocation property={BIEN} personnel={false} lienVersLeBailleur={false} onOuvrirLAnnonce={() => {}} />,
  },
  { vue: 'OngletDocuments (du bien)', cible: /\/api\/documents(\?|$)/, rendre: () => <DocumentsDuBien /> },
  {
    vue: 'FeuilleDesGarants · modification',
    cible: /\/api\/guarantors\/2(\?|$)/,
    rendre: () => <FeuilleDesGarants leaseId={42} garants={[GARANT]} peutGerer ouverte onFermer={() => {}} />,
    avant: async () => {
      await userEvent.click(await screen.findByRole('button', { name: 'Modifier Ousmane Seck' }));
    },
  },
  { vue: 'LeaseSchedule', cible: /\/api\/leases\/1\/payments/, rendre: () => <LeaseSchedule leaseId={1} agencyId={1} landlordId={7} /> },
  {
    vue: 'VersionsDuDocument',
    cible: /\/api\/documents\/5\/versions(\?|$)/,
    rendre: () => <VersionsDuDocument documentId={5} peutAjouter={false} peutRestaurer={false} />,
  },
  { vue: 'FilDuClient', cible: /\/api\/customers\/7\/timeline(\?|$)/, rendre: () => <FilDuClient customer={CLIENT} notes={[]} demandeDeSaisie={null} /> },
  {
    vue: 'PropertyModerationDetail',
    cible: /\/api\/properties\/moderation\/12(\?|$)/,
    rendre: () => <PropertyModerationDetail property={{ id: 12, title: 'Studio Mermoz' } as never} onModerated={() => {}} />,
  },
  { vue: 'UserDetailPage (super-admin)', cible: /\/api\/super-admin\/users\/21(\?|$)/, rendre: () => <UserDetailPage userId={21} /> },
  { vue: 'AdminCreditWalletDetail', cible: /\/api\/super-admin\/credit-wallets\/3(\?|$)/, rendre: () => <AdminCreditWalletDetail agencyId={3} /> },
];

const fetchMock = vi.fn();
const reponse = (status: number) =>
  new Response(JSON.stringify({ message: status === 500 ? 'Server Error' : 'Refused.' }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const lectures = (ligne: Ligne) => fetchMock.mock.calls.filter(([url]) => ligne.cible.test(String(url))).length;

function monter(ligne: Ligne, status: number) {
  fetchMock.mockImplementation((url: unknown) =>
    ligne.cible.test(String(url)) ? Promise.resolve(reponse(status)) : new Promise<Response>(() => {}),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{ligne.rendre()}</QueryClientProvider>));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

/**
 * AC1 — relevé AVANT le changement (arbre non modifié, 2026-11-14), par ce même harnais : les douze
 * lieux rendaient leur texte de panne ET « Réessayer » sous 403 comme sous 404 (détail dans les notes
 * du ticket). PropertyModerationDetail rendait la prose brute du serveur.
 */
const REFUS = "Votre profil actif ne permet pas d'ouvrir ce contenu.";
const INTROUVABLE = 'Ce contenu est introuvable.';

describe.each(LIGNES)('$vue sur une lecture en erreur (TCK-2814, AC3)', (ligne) => {
  it('une panne (500) propose « Réessayer », et un clic relance la lecture', async () => {
    monter(ligne, 500);
    await ligne.avant?.();
    const reessayer = await screen.findByRole('button', { name: 'Réessayer' });
    expect(screen.queryByText(REFUS)).toBeNull();
    expect(screen.queryByText(INTROUVABLE)).toBeNull();
    const avant = lectures(ligne);
    await userEvent.click(reessayer);
    await vi.waitFor(() => expect(lectures(ligne)).toBeGreaterThan(avant));
  });

  it.each([
    [403, REFUS],
    [404, INTROUVABLE],
  ])('un %i dit pourquoi, sans « Réessayer »', async (status, texte) => {
    monter(ligne, status);
    await ligne.avant?.();
    // Le texte d'abord : sans lui, l'absence du bouton se vérifierait pendant le chargement.
    expect(await screen.findByText(texte)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
  });
});
