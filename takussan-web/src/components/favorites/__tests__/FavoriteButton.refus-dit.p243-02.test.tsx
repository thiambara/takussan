import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { ApiError } from '@/lib/api';
import { withIntl } from '@/test/intl';
import { useFavorite } from '@/hooks/useFavorite';
import { FavoriteButton } from '../FavoriteButton';

/**
 * P243.02 (TCK-2371) — un favori refusé par l'API remettait le cœur sans un mot : le geste « ne
 * prenait pas », sans dire pourquoi (session expirée, réseau). Décision du porteur : le refus se
 * dit par un toast `messageErreur`. Le bouton des cartes et le hook de la fiche, les deux chemins.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/properties',
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }),
}));
const apiRequestMock = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));
const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/toast')>()),
  useToast: () => ({ add: toastAdd }),
}));

const SESSION_EXPIREE = 'Votre session a expiré.';

function Fournisseurs({ children }: { readonly children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return withIntl(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

describe('Favori refusé par l’API — le refus est dit (P243.02)', () => {
  beforeEach(() => {
    localStorage.clear();
    toastAdd.mockReset();
    apiRequestMock.mockReset();
    apiRequestMock.mockRejectedValue(new ApiError(401, { message: SESSION_EXPIREE }));
  });

  it('<FavoriteButton> : le cœur revient, et un toast dit le refus', async () => {
    render(<Fournisseurs><FavoriteButton propertyId={42} /></Fournisseurs>);

    await userEvent.click(screen.getByRole('button', { name: /ajouter aux favoris/i }));

    await waitFor(() => expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({
      type: 'error',
      description: SESSION_EXPIREE,
    })));
    expect(screen.getByRole('button', { name: /ajouter aux favoris/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('useFavorite (fiche du bien) : le cœur revient, et un toast dit le refus', async () => {
    const { result } = renderHook(() => useFavorite(42), { wrapper: Fournisseurs });

    await act(async () => {
      await result.current.toggle();
    });

    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', description: SESSION_EXPIREE }));
    expect(result.current.isFavorite).toBe(false);
  });
});
