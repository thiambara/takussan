import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { DocumentsLibrary } from '../DocumentsLibrary';
import type { Document } from '@/types/document';
import type { User } from '@/lib/auth';

const routerReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace }),
  useSearchParams: () => new URLSearchParams(''),
}));

const authState = {
  user: null as User | null,
};

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: authState.user,
    token: 'token',
    isLoading: false,
  }),
}));

const mutation = {
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
};

const documentsQuery = {
  data: {
    data: [] as Document[],
    meta: { total: 0, current_page: 1, last_page: 1, per_page: 30 },
    links: { first: null, last: null, prev: null, next: null },
  },
  isLoading: false,
  isError: false,
  error: null,
};

vi.mock('@/lib/queries/documents', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries/documents')>(
    '@/lib/queries/documents',
  );
  return {
    ...actual,
    useDocuments: () => documentsQuery,
    useDeleteDocument: () => mutation,
    useUploadDocument: () => mutation,
    useCreateShareLink: () => mutation,
    useRevokeShareLink: () => mutation,
  };
});

function wrap(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider
      locale="fr"
      messages={{ common: { actions: { close: 'Fermer' } } }}
    >
      {ui}
    </NextIntlClientProvider>
  );
}

function ownerUser(): User {
  return {
    id: 1,
    first_name: 'Aminata',
    last_name: 'Diop',
    full_name: 'Aminata Diop',
    email: 'owner@example.test',
    phone: null,
    bio: null,
    avatar_url: null,
    email_verified_at: null,
    phone_verified_at: null,
    two_factor_enabled: false,
    roles: ['owner'],
    status: 'active',
    created_at: '2026-05-06T00:00:00.000Z',
  };
}

describe('<DocumentsLibrary>', () => {
  beforeEach(() => {
    authState.user = ownerUser();
    documentsQuery.data.data = [];
    documentsQuery.data.meta.total = 0;
    documentsQuery.isLoading = false;
    documentsQuery.isError = false;
    routerReplace.mockClear();
    mutation.mutate.mockClear();
    mutation.mutateAsync.mockClear();
  });

  it('renders an owner-specific empty state without fake documents', () => {
    render(wrap(<DocumentsLibrary />));

    expect(screen.getByText('Aucun document propriétaire')).toBeInTheDocument();
    expect(screen.getAllByText(/titre foncier/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/bail signé/i)).toBeInTheDocument();
    expect(screen.getAllByText(/quittance/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/devis ou facture/i)).toBeInTheDocument();
    expect(screen.getAllByText(/pièce propriétaire/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Bien')).toBeInTheDocument();
    expect(screen.getByText('Bail')).toBeInTheDocument();
    expect(screen.getByText('Utilisateur')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /document/i })).not.toBeInTheDocument();
  });

  it('opens the existing upload flow from the owner empty-state CTA', async () => {
    const user = userEvent.setup();
    render(wrap(<DocumentsLibrary />));

    await user.click(screen.getAllByRole('button', { name: /Téléverser un document/i })[1]);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Téléverser un document' })).toBeInTheDocument();
    expect(screen.getByText(/Associez le fichier à une entité/i)).toBeInTheDocument();
  });

  it('keeps the generic empty state for non-owner users', () => {
    authState.user = { ...ownerUser(), roles: ['tenant'] };

    render(wrap(<DocumentsLibrary />));

    expect(screen.queryByText('Aucun document propriétaire')).not.toBeInTheDocument();
    expect(screen.getByText(/Aucun document pour le moment/i)).toBeInTheDocument();
  });
});
