/**
 * TCK-596 §4B (ADR-0042) — le panneau de signature du bail.
 *
 * Ce qu'il garde : l'écran n'ouvre que ce que l'API laisse faire (`can_sign_as`,
 * `can_request_signature`), une signature posée sur un contrat défigé ne s'affiche pas comme
 * valable, le code se saisit en six chiffres et rien d'autre, et la voie papier exige le fichier.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { ApiError } from '@/lib/api';
import type { Lease, LeaseSignature } from '@/types/lease';

const { appels, mutation } = vi.hoisted(() => ({
  appels: {
    request: vi.fn(async () => ({ data: {} })),
    sendCode: vi.fn(async (_vars: unknown) => ({ data: { channel: 'mail', destination: 'a•••@exemple.sn' } })),
    sign: vi.fn(async (_vars: unknown) => ({ data: { status: 'pending_signature' } })),
    activate: vi.fn(async (_vars: unknown) => ({ data: { status: 'active' } })),
  },
  mutation: (fn: (vars: unknown) => Promise<unknown>) => () => ({
    mutateAsync: fn,
    isPending: false,
  }),
}));

vi.mock('@/lib/queries/leases', () => ({
  useRequestLeaseSignature: mutation(() => appels.request()),
  useSendLeaseSignatureCode: mutation((v) => appels.sendCode(v)),
  useSignLease: mutation((v) => appels.sign(v)),
  useActivateLease: mutation((v) => appels.activate(v)),
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ add: vi.fn() }),
}));

import { LeaseSignaturePanel } from '../LeaseSignaturePanel';

const SHA = 'a'.repeat(64);

function bail(overrides: Partial<Lease> = {}): Lease {
  return {
    id: 1,
    property_id: 10,
    landlord_id: 20,
    tenant_id: 300,
    agency_id: 5,
    booking_id: null,
    renewed_from_lease_id: null,
    reference_number: 'LS-SIGN',
    type: 'residential_rent',
    status: 'pending_signature',
    start_date: '2026-01-01',
    end_date: '2027-01-01',
    renewal_date: null,
    monthly_rent: 400_000,
    sale_price: null,
    currency: 'XOF',
    deposit_amount: 800_000,
    deposit_refunded_amount: null,
    deposit_refunded_at: null,
    deposit_refund_reason: null,
    commission_amount: null,
    commission_rate: null,
    payment_frequency: 'monthly',
    payment_day: 5,
    terms: null,
    special_conditions: null,
    guarantor_id: null,
    signed_at: null,
    terminated_at: null,
    termination_reason: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    contract_sha256: SHA,
    signature_requested_at: '2026-10-08T10:00:00Z',
    signatures: [],
    can_sign_as: [],
    can_request_signature: false,
    ...overrides,
  };
}

function preuve(overrides: Partial<LeaseSignature> = {}): LeaseSignature {
  return {
    id: 1,
    role: 'landlord',
    method: 'otp',
    signed_at: '2026-10-08T11:00:00Z',
    document_sha256: SHA,
    current: true,
    signer_name: 'Awa Agent',
    on_behalf_of_name: null,
    otp_channel: 'sms',
    ...overrides,
  };
}

const rendre = (lease: Lease) => render(withIntl(<LeaseSignaturePanel lease={lease} />));

describe('LeaseSignaturePanel (TCK-596 §4B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('le gestionnaire fige un brouillon : seule la demande et la voie papier sont offertes', async () => {
    rendre(bail({ status: 'draft', contract_sha256: null, can_request_signature: true, can_activate_on_paper: true }));

    expect(screen.queryByRole('button', { name: 'Lire le contrat à signer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recevoir mon code' })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Demander la signature' }));
    });
    expect(appels.request).toHaveBeenCalledTimes(1);
  });

  it('le locataire lit le contrat figé, reçoit son code et signe pour son seul rôle', async () => {
    rendre(bail({ can_sign_as: ['tenant'] }));

    // Un bouton de téléchargement authentifié (TCK-593), jamais un lien nu vers `/api`.
    expect(screen.getByRole('button', { name: 'Lire le contrat à signer' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Lire le contrat à signer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Demander la signature' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Contrat signé sur papier (PDF, JPG ou PNG, 10 Mo)')).not.toBeInTheDocument();
    // Un seul bouton : celui du rôle locataire.
    expect(screen.getAllByRole('button', { name: 'Recevoir mon code' })).toHaveLength(1);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Recevoir mon code' }));
    });
    expect(appels.sendCode).toHaveBeenCalledWith({ role: 'tenant' });
    expect(screen.getByText(/Code envoyé par e-mail à a•••@exemple\.sn/)).toBeInTheDocument();

    const champ = screen.getByLabelText('Code à 6 chiffres');
    const signer = screen.getByRole('button', { name: 'Signer' });
    fireEvent.change(champ, { target: { value: '12a45' } });
    expect(champ).toHaveValue('1245');
    expect(signer).toBeDisabled();

    fireEvent.change(champ, { target: { value: '123456' } });
    expect(signer).toBeEnabled();
    await act(async () => {
      fireEvent.click(signer);
    });
    expect(appels.sign).toHaveBeenCalledWith({ role: 'tenant', code: '123456' });
  });

  it("dit qui a signé pour le compte du bailleur", () => {
    rendre(bail({ signatures: [preuve({ on_behalf_of_name: 'Moussa Bailleur' })] }));

    expect(screen.getByTestId('lease-signature-landlord')).toHaveTextContent(
      /Signé par Awa Agent pour le compte de Moussa Bailleur/,
    );
    expect(screen.getByTestId('lease-signature-tenant')).toHaveTextContent('En attente');
  });

  it("une signature posée sur un contrat défigé n'est pas affichée comme valable", () => {
    rendre(
      bail({
        can_sign_as: ['landlord'],
        signatures: [preuve({ current: false, document_sha256: 'b'.repeat(64) })],
      }),
    );

    expect(screen.getByTestId('lease-signature-landlord')).toHaveTextContent('En attente');
    expect(screen.getByRole('button', { name: 'Recevoir mon code' })).toBeInTheDocument();
  });

  it("affiche le refus de l'API tel qu'elle le dit", async () => {
    appels.sendCode.mockRejectedValueOnce(
      // 423 et non 429 : sur un 429, le front affiche le générique « trop de tentatives » et perd
      // la durée du verrou que l'API dit.
      new ApiError(423, {
        message: 'Trop de codes faux : la signature est bloquée pendant 15 minutes.',
        code: 'lease_signature.code_locked',
      }),
    );
    rendre(bail({ can_sign_as: ['tenant'] }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Recevoir mon code' }));
    });

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Trop de codes faux : la signature est bloquée pendant 15 minutes.',
      ),
    );
  });

  it('la voie papier exige le fichier, puis l’envoie', async () => {
    rendre(bail({ status: 'draft', contract_sha256: null, can_request_signature: true, can_activate_on_paper: true }));

    const envoyer = screen.getByRole('button', { name: 'Activer sur contrat papier' });
    expect(envoyer).toBeDisabled();

    const fichier = new File(['%PDF-1.4'], 'bail.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Contrat signé sur papier (PDF, JPG ou PNG, 10 Mo)'), {
      target: { files: [fichier] },
    });
    await act(async () => {
      fireEvent.click(envoyer);
    });
    expect(appels.activate).toHaveBeenCalledWith({ contract: fichier });
  });

  it("un gestionnaire sans `leases.sign` lance la demande mais n'a pas la voie papier (VERIF-596 M1)", () => {
    rendre(bail({ status: 'draft', contract_sha256: null, can_request_signature: true, can_activate_on_paper: false }));

    expect(screen.getByRole('button', { name: 'Demander la signature' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activer sur contrat papier' })).not.toBeInTheDocument();
  });

  it("n'apparaît pas sur un bail actif", () => {
    rendre(bail({ status: 'active', can_request_signature: true }));

    expect(screen.queryByTestId('lease-signature-panel')).not.toBeInTheDocument();
  });
});
