/**
 * TCK-2671 — la demande de passage en pro, préremplie et reprise.
 *
 * - ADR-0104 § 2 : une première demande se préremplit des mentions légales de l'agence, et
 *   l'ouvrir n'écrit aucun brouillon (TCK-566 : l'état d'ouverture est l'état vierge).
 * - AC4 (ADR-0104 § 5) : une demande refusée se reprend — préremplie de la demande, NINEA et RIB
 *   conservés côté serveur, l'envoi part avec `resubmit_of` et sans `ninea` ni `rib_pro`.
 * - Messages d'échec précis : jamais « Une erreur est survenue ».
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import frMessages from '@/messages/fr.json';

// Mock the query layer so the form never hits the network.
const submitAgencyUpgradeRequest = vi.fn();
const renvoyerUneDemandeRefusee = vi.fn();
vi.mock('@/lib/queries/agency-upgrade', () => ({
  submitAgencyUpgradeRequest: (...args: unknown[]) => submitAgencyUpgradeRequest(...args),
  renvoyerUneDemandeRefusee: (...args: unknown[]) => renvoyerUneDemandeRefusee(...args),
  revokeAgencyUpgradeRequest: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, roles: ['agency_admin'] },
    token: 'token',
    isLoading: false,
    setUser: vi.fn(),
    refreshUser: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
}));

const routerRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: routerRefresh, prefetch: vi.fn() }),
}));

// `useWizardDraft` autosaves via fetch — short-circuit so we can hydrate
// instantly with empty state and assert on submit synchronously.
//
// TCK-482 — les doublures sont HOISTÉES et STABLES, et c'est ce qui rend le
// ticket testable : la fabrique rendait un objet neuf à chaque rendu, donc un
// `clear` neuf à chaque rendu. Assurer « le brouillon n'a pas été détruit »
// exigeait de tenir la MÊME référence d'un bout à l'autre du test.
const brouillon = vi.hoisted(() => ({
  save: vi.fn(),
  // TCK-475 — cette doublure rendait `undefined`, et c'était FAUX depuis
  // TCK-465 : `flush()` rend un `ResultatEcritureBrouillon`, plus
  // `Promise<void>`. Elle était verte *parce que* l'appelant ne lisait rien —
  // un test vert qui ne prouvait rien. `{ ok: true, ecrit: false }` est ce que
  // la production rend au repos : rien en attente, aucun échec antérieur
  // (`useWizardDraft.ts`, `flush()`). AC5 : jamais `undefined`.
  flush: vi.fn(),
  clear: vi.fn(),
  // TCK-566 — le brouillon serveur lu à l'ouverture, piloté par test.
  draft: null as { step: number; data: Record<string, unknown> } | null,
}));

vi.mock('@/hooks/useWizardDraft', () => ({
  useWizardDraft: () => ({
    draft: brouillon.draft,
    isLoading: false,
    isSaving: false,
    error: null,
    save: brouillon.save,
    flush: brouillon.flush,
    clear: brouillon.clear,
  }),
}));

const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/toast')>();
  return {
    ...actual,
    useToast: () => ({ add: toastAdd }),
  };
});

import { UpgradeRequestForm } from '../UpgradeRequestForm';
import { ApiError } from '@/lib/api';
import type { AgencyUpgradeRequest } from '@/types/agency-upgrade';

function withIntl(node: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {node}
    </NextIntlClientProvider>
  );
}

/** TCK-2671 — deux champs fichier masqués (photo, fichier) derrière deux boutons : on vise le sélecteur. */
function fichierDesStatuts(): HTMLInputElement {
  return document.querySelector('input[data-champ="statuts-fichier"]') as HTMLInputElement;
}

const PIECE = () => new File(['%PDF-1.4'], 'statuts.pdf', { type: 'application/pdf' });

const REFUSEE: AgencyUpgradeRequest = {
  id: 2,
  agency_id: 42,
  submitted_by: 1,
  rc: 'SN-DKR-2024-B-12345',
  ninea: '******126',
  rib_pro: 'SN09 **** **** 07',
  company_legal_name: 'Studio de Aminata SARL',
  address_fiscale: 'Villa 218, Sacré-Cœur 3, Dakar',
  planned_agents_count: 4,
  status: 'rejected',
  submitted_at: '2026-10-28T10:00:00Z',
  reviewed_by: 9,
  reviewed_at: '2026-11-02T10:00:00Z',
  review_comment: 'Statuts illisibles',
  resubmit_of_id: null,
  created_at: '2026-10-28T10:00:00Z',
  updated_at: '2026-11-02T10:00:00Z',
};

describe('<UpgradeRequestForm> — préremplissage et reprise (TCK-2671)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    brouillon.draft = null;
    brouillon.flush.mockResolvedValue({ ok: true, ecrit: false });
    brouillon.clear.mockResolvedValue(true);
  });

  it('une première demande reprend les mentions légales, le dit, et n’écrit aucun brouillon à l’ouverture', () => {
    render(
      withIntl(
        <UpgradeRequestForm
          agencyId={42}
          prefill={{ company_legal_name: 'Dakar Immo SARL', rc: 'SN-DKR-2017-B-8841', ninea: '004512387', address_fiscale: 'Rue 10, Dakar' }}
        />,
      ),
    );
    expect(screen.getByLabelText('Raison sociale')).toHaveValue('Dakar Immo SARL');
    expect(screen.getByLabelText('RCCM')).toHaveValue('SN-DKR-2017-B-8841');
    expect(screen.getByLabelText('NINEA')).toHaveValue('004512387');
    expect(screen.getByLabelText('Adresse fiscale')).toHaveValue('Rue 10, Dakar');
    expect(screen.getByLabelText('RIB professionnel')).toHaveValue('');
    expect(screen.getAllByText('Repris de votre fiche')).toHaveLength(4);
    expect(brouillon.save).not.toHaveBeenCalled();
    expect(brouillon.clear).not.toHaveBeenCalled();

    // Une valeur changée n'est plus « reprise », et c'est une saisie : le brouillon s'écrit.
    fireEvent.change(screen.getByLabelText('Raison sociale'), { target: { value: 'Dakar Immo SA' } });
    expect(screen.getAllByText('Repris de votre fiche')).toHaveLength(3);
    expect(brouillon.save).toHaveBeenCalledWith(0, expect.objectContaining({ company_legal_name: 'Dakar Immo SA' }));
  });

  it('un brouillon relu complète le préremplissage sans l’effacer', () => {
    brouillon.draft = { step: 0, data: { rc: 'RC-BROUILLON', company_legal_name: '', address_fiscale: null, planned_agents_count: 3 } };
    render(withIntl(<UpgradeRequestForm agencyId={42} prefill={{ company_legal_name: 'Dakar Immo SARL', rc: 'SN-1' }} />));
    expect(screen.getByLabelText('RCCM')).toHaveValue('RC-BROUILLON');
    expect(screen.getByLabelText('Raison sociale')).toHaveValue('Dakar Immo SARL');
    expect(screen.getByLabelText(/Nombre estimé d.agents/i)).toHaveValue(3);
  });

  it('AC4 — reprise d’une demande refusée : préremplie, NINEA et RIB conservés, envoi sans eux avec resubmit_of', async () => {
    renvoyerUneDemandeRefusee.mockResolvedValue({ data: { id: 3 } });
    render(withIntl(<UpgradeRequestForm agencyId={42} refusee={REFUSEE} prefill={{ ninea: '999999999' }} />));

    expect(screen.getByText(/Vos réponses du 28 oct\. sont conservées/)).toBeInTheDocument();
    expect(screen.getByLabelText('RCCM')).toHaveValue('SN-DKR-2024-B-12345');
    expect(screen.getByLabelText('Raison sociale')).toHaveValue('Studio de Aminata SARL');
    expect(screen.getByLabelText(/Nombre estimé d.agents/i)).toHaveValue(4);
    // Ni le masque de l'API, ni le NINEA de l'agence : les deux champs s'ouvrent vides.
    expect(screen.getByLabelText('NINEA')).toHaveValue('');
    expect(screen.getByLabelText('RIB professionnel')).toHaveValue('');
    expect(screen.getByLabelText('NINEA')).toHaveAccessibleDescription('Conservé de votre demande (******126) : laissez vide pour le garder.');
    expect(screen.getByText('à remplacer')).toBeInTheDocument();
    expect(brouillon.save).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Adresse fiscale'), { target: { value: 'Villa 220, Sacré-Cœur 3, Dakar' } });
    fireEvent.change(fichierDesStatuts(), { target: { files: [PIECE()] } });
    fireEvent.submit(screen.getByRole('form', { name: 'Formulaire de demande de passage en pro' }));

    await waitFor(() => expect(renvoyerUneDemandeRefusee).toHaveBeenCalledTimes(1));
    const [jeton, agence, reprise, modifies, piece] = renvoyerUneDemandeRefusee.mock.calls[0];
    expect([jeton, agence, reprise]).toEqual(['token', 42, 2]);
    expect(modifies).toEqual({ address_fiscale: 'Villa 220, Sacré-Cœur 3, Dakar' });
    expect(piece).toBeInstanceOf(File);
    expect(submitAgencyUpgradeRequest).not.toHaveBeenCalled();
  });

  it('AC4 — un NINEA retapé part, lui seul', async () => {
    renvoyerUneDemandeRefusee.mockResolvedValue({ data: { id: 3 } });
    render(withIntl(<UpgradeRequestForm agencyId={42} refusee={REFUSEE} />));
    fireEvent.change(screen.getByLabelText('NINEA'), { target: { value: '007845126' } });
    expect(screen.getByLabelText('NINEA')).not.toHaveAccessibleDescription(/Conservé/);
    fireEvent.change(fichierDesStatuts(), { target: { files: [PIECE()] } });
    fireEvent.submit(screen.getByRole('form', { name: 'Formulaire de demande de passage en pro' }));
    await waitFor(() => expect(renvoyerUneDemandeRefusee).toHaveBeenCalledTimes(1));
    expect(renvoyerUneDemandeRefusee.mock.calls[0][3]).toEqual({ ninea: '007845126' });
  });

  it('une erreur 422 sans champ à l’écran (resubmit_of) se dit, jamais en silence', async () => {
    renvoyerUneDemandeRefusee.mockRejectedValue(
      new ApiError(422, { message: 'x', errors: { resubmit_of: ['Seule la dernière demande refusée peut être reprise.'] } }),
    );
    render(withIntl(<UpgradeRequestForm agencyId={42} refusee={REFUSEE} />));
    fireEvent.change(fichierDesStatuts(), { target: { files: [PIECE()] } });
    fireEvent.submit(screen.getByRole('form', { name: 'Formulaire de demande de passage en pro' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Seule la dernière demande refusée peut être reprise.');
  });

  it('un échec réseau dit que la demande n’est pas partie et que les réponses sont gardées', async () => {
    submitAgencyUpgradeRequest.mockRejectedValue(new TypeError('Failed to fetch'));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(withIntl(<UpgradeRequestForm agencyId={42} />));
    fireEvent.change(fichierDesStatuts(), { target: { files: [PIECE()] } });
    fireEvent.submit(screen.getByRole('form', { name: 'Formulaire de demande de passage en pro' }));
    const alerte = await screen.findByRole('alert');
    expect(alerte).not.toHaveTextContent(/Une erreur est survenue/);
    expect(alerte.textContent?.length).toBeGreaterThan(10);
  });

  it('les statuts se prennent en photo ou se choisissent ; un fichier de plus de 10 Mo est refusé avant l’envoi', () => {
    render(withIntl(<UpgradeRequestForm agencyId={42} />));
    expect(screen.getByRole('button', { name: 'Prendre en photo les statuts juridiques' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choisir le fichier des statuts juridiques' })).toBeInTheDocument();
    expect(document.querySelector('input[data-champ="statuts-photo"]')).toHaveAttribute('capture', 'environment');

    const lourd = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'statuts.pdf', { type: 'application/pdf' });
    fireEvent.change(fichierDesStatuts(), { target: { files: [lourd] } });
    expect(screen.getByText('Le fichier dépasse 10 Mo.')).toBeInTheDocument();

    fireEvent.change(fichierDesStatuts(), { target: { files: [PIECE()] } });
    expect(screen.queryByText('Le fichier dépasse 10 Mo.')).not.toBeInTheDocument();
    expect(screen.getByText('statuts.pdf')).toBeInTheDocument();
  });

  it('libellé accessible sans « upgrade », « RCCM » et non « Numéro RC »', () => {
    render(withIntl(<UpgradeRequestForm agencyId={42} />));
    expect(screen.getByRole('form').getAttribute('aria-label')).not.toMatch(/upgrade/i);
    expect(screen.queryByText(/Numéro RC/)).not.toBeInTheDocument();
  });
});
