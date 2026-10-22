import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

/** TCK-1203 — l'entrée de la console demande le second facteur qui lui manque. */
const router = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'jeton', logout: vi.fn(), refreshUser: vi.fn() }),
}));
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiRequest };
});
vi.mock('@/components/auth/EnrolementDoubleFacteurExige', () => ({
  EnrolementDoubleFacteurExige: ({ destination }: { destination: string }) => <p>enrôlement vers {destination}</p>,
}));
vi.mock('@/components/brand/BarreDeMarque', () => ({ BarreDeMarque: () => null }));

const { EntreeConsoleDoubleFacteur } = await import('../EntreeConsoleDoubleFacteur');

beforeEach(() => {
  router.refresh.mockReset();
  router.replace.mockReset();
  apiRequest.mockReset();
});

describe('<EntreeConsoleDoubleFacteur>', () => {
  it('sans 2FA sur le compte : l’enrôlement, qui ramène à la console', () => {
    render(withIntl(<EntreeConsoleDoubleFacteur code="two_factor_required" />));
    expect(screen.getByText('enrôlement vers /super-admin')).toBeInTheDocument();
  });

  it('2FA non vue par ce jeton : le code est demandé, puis la console se relit', async () => {
    apiRequest.mockResolvedValue({});
    render(withIntl(<EntreeConsoleDoubleFacteur code="two_factor_step_up_required" />));

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Code à 6 chiffres/), '123456');
    await user.click(screen.getByRole('button', { name: /Confirmer/ }));

    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(apiRequest).toHaveBeenCalledWith(
      '/api/auth/two-factor/step-up',
      expect.objectContaining({ method: 'POST', body: { code: '123456' } }),
    );
  });
});
