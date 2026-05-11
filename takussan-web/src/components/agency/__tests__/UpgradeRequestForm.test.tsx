import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import frMessages from '@/messages/fr.json';

// Mock the query layer so the form never hits the network.
const submitAgencyUpgradeRequest = vi.fn();
vi.mock('@/lib/queries/agency-upgrade', () => ({
  submitAgencyUpgradeRequest: (...args: unknown[]) =>
    submitAgencyUpgradeRequest(...args),
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
vi.mock('@/hooks/useWizardDraft', () => ({
  useWizardDraft: () => ({
    draft: null,
    isLoading: false,
    isSaving: false,
    error: null,
    save: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
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

function withIntl(node: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {node}
    </NextIntlClientProvider>
  );
}

function fillRequiredText() {
  fireEvent.change(screen.getByLabelText(/Numéro RC/i), { target: { value: 'RC-123' } });
  fireEvent.change(screen.getByLabelText(/^NINEA/i), { target: { value: '0123456789012' } });
  fireEvent.change(screen.getByLabelText(/RIB professionnel/i), {
    target: { value: 'SN012 01234 0123456789012 34' },
  });
  fireEvent.change(screen.getByLabelText(/Raison sociale/i), {
    target: { value: 'Takussan Immo SARL' },
  });
  fireEvent.change(screen.getByLabelText(/Adresse fiscale/i), {
    target: { value: '12 Avenue LSS, Dakar' },
  });
}

describe('<UpgradeRequestForm>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks submission when no statuts file is attached', async () => {
    render(withIntl(<UpgradeRequestForm agencyId={42} />));

    fillRequiredText();
    const form = screen.getByRole('form', { name: /Formulaire de demande/i });
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/scan des statuts est obligatoire/i)).toBeInTheDocument();
    });
    expect(submitAgencyUpgradeRequest).not.toHaveBeenCalled();
  });

  it('submits the multipart payload on happy path', async () => {
    submitAgencyUpgradeRequest.mockResolvedValue({
      data: {
        id: 1,
        agency_id: 42,
        submitted_by: 1,
        rc: 'RC-123',
        ninea: '0123456789012',
        rib_pro: 'SN012 01234 0123456789012 34',
        company_legal_name: 'Takussan Immo SARL',
        address_fiscale: '12 Avenue LSS, Dakar',
        planned_agents_count: null,
        status: 'pending',
        submitted_at: '2026-05-11T10:00:00Z',
        reviewed_by: null,
        reviewed_at: null,
        review_comment: null,
        created_at: '2026-05-11T10:00:00Z',
        updated_at: '2026-05-11T10:00:00Z',
      },
    });

    render(withIntl(<UpgradeRequestForm agencyId={42} />));
    fillRequiredText();

    const file = new File(['%PDF-1.4'], 'statuts.pdf', { type: 'application/pdf' });
    const fileInput = screen.getByLabelText(/Statuts juridiques/i) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.submit(screen.getByRole('form', { name: /Formulaire de demande/i }));

    await waitFor(() => {
      expect(submitAgencyUpgradeRequest).toHaveBeenCalledTimes(1);
    });

    const [, agencyId, fields, sentFile] = submitAgencyUpgradeRequest.mock.calls[0];
    expect(agencyId).toBe(42);
    expect(fields).toEqual(
      expect.objectContaining({
        rc: 'RC-123',
        ninea: '0123456789012',
        company_legal_name: 'Takussan Immo SARL',
      }),
    );
    expect(sentFile).toBe(file);

    await waitFor(() => {
      expect(toastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success' }),
      );
    });
    expect(routerRefresh).toHaveBeenCalled();
  });

  it('surfaces 422 validation errors inline', async () => {
    submitAgencyUpgradeRequest.mockRejectedValue(
      new ApiError(422, {
        message: 'Validation failed.',
        errors: { ninea: ['NINEA déjà utilisé.'] },
      }),
    );

    render(withIntl(<UpgradeRequestForm agencyId={42} />));
    fillRequiredText();
    const file = new File(['%PDF-1.4'], 'statuts.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/Statuts juridiques/i), {
      target: { files: [file] },
    });

    fireEvent.submit(screen.getByRole('form', { name: /Formulaire de demande/i }));

    await waitFor(() => {
      expect(screen.getByText('NINEA déjà utilisé.')).toBeInTheDocument();
    });
    // Field-level errors don't trigger a toast.
    expect(toastAdd).not.toHaveBeenCalled();
  });
});
