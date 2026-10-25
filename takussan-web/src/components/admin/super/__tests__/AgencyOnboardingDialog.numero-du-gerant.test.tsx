import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';
import { postAgencyOnboarding } from '@/lib/queries/super-admin';
import { withIntl } from '@/test/intl';
import { AgencyOnboardingDialog } from '../AgencyOnboardingDialog';

/**
 * P251.02 (TCK-2365, décision du porteur du 2026-10-25) — la console demande, facultatif, le
 * numéro du gérant. L'API le cherche parmi les numéros vérifiés et refuse en 409
 * `agency.admin_phone_taken` s'il appartient à un compte : l'écran dit lequel des deux conflits.
 */
vi.mock('@/lib/queries/super-admin', () => ({
  postAgencyOnboarding: vi.fn(),
}));

async function remplir(numero?: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(withIntl(
    <ToastProvider>
      <QueryClientProvider client={queryClient}>
        <AgencyOnboardingDialog />
      </QueryClientProvider>
    </ToastProvider>,
  ));

  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /nouvelle agence/i }));
  await user.type(screen.getAllByRole('textbox')[0], 'Sunu Gestion');
  await user.click(screen.getByRole('button', { name: /continuer/i }));

  expect(screen.getByText('Téléphone du gérant (facultatif)')).toBeInTheDocument();
  const champs = screen.getAllByRole('textbox');
  await user.type(champs[0], 'Awa');
  await user.type(champs[1], 'Ndiaye');
  await user.type(champs[2], 'gerant@sunu.test');
  if (numero) await user.type(champs[3], numero);
  await user.click(screen.getByRole('button', { name: /continuer/i }));
  await user.click(screen.getByRole('button', { name: /créer et inviter/i }));
}

describe('<AgencyOnboardingDialog> — numéro du gérant', () => {
  beforeEach(() => {
    vi.mocked(postAgencyOnboarding).mockReset();
  });

  it('envoie le numéro saisi, et dit le conflit de numéro', async () => {
    vi.mocked(postAgencyOnboarding).mockRejectedValue(
      new ApiError(409, { code: 'agency.admin_phone_taken', message: 'x' }),
    );
    await remplir(' +221 77 111 22 33 ');

    expect(vi.mocked(postAgencyOnboarding).mock.calls[0][0].admin.phone).toBe('+221 77 111 22 33');
    expect(await screen.findByText('Un compte existe déjà avec ce numéro vérifié.')).toBeInTheDocument();
    expect(screen.queryByText('Un compte existe déjà avec cet email admin.')).toBeNull();
  });

  it('sans numéro, la clé ne part pas, et le conflit d’e-mail garde son message', async () => {
    vi.mocked(postAgencyOnboarding).mockRejectedValue(
      new ApiError(409, { code: 'agency.admin_email_taken', message: 'x' }),
    );
    await remplir();

    expect(vi.mocked(postAgencyOnboarding).mock.calls[0][0].admin).not.toHaveProperty('phone');
    expect(await screen.findByText('Un compte existe déjà avec cet email admin.')).toBeInTheDocument();
  });
});
