import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toast';
import { postAgencyOnboarding } from '@/lib/queries/super-admin';
import { withIntl } from '@/test/intl';
import { AgencyOnboardingDialog } from '../AgencyOnboardingDialog';

vi.mock('@/lib/queries/super-admin', () => ({
  postAgencyOnboarding: vi.fn(),
}));

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(withIntl(
    <ToastProvider>
      <QueryClientProvider client={queryClient}>
        <AgencyOnboardingDialog />
      </QueryClientProvider>
    </ToastProvider>,
  ));
}

describe('<AgencyOnboardingDialog>', () => {
  it('keeps the final submit non-repeatable while the creation is pending', async () => {
    vi.mocked(postAgencyOnboarding).mockReturnValue(new Promise(() => {}));
    renderDialog();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /nouvelle agence/i }));

    const agencyInputs = screen.getAllByRole('textbox');
    await user.type(agencyInputs[0], 'Sunu Gestion');
    await user.type(agencyInputs[3], 'contact@sunu.test');
    await user.click(screen.getByRole('button', { name: /continuer/i }));

    const adminInputs = screen.getAllByRole('textbox');
    await user.type(adminInputs[0], 'Awa');
    await user.type(adminInputs[1], 'Ndiaye');
    await user.type(adminInputs[2], 'admin@sunu.test');
    await user.click(screen.getByRole('button', { name: /continuer/i }));

    const submit = screen.getByRole('button', { name: /créer et inviter/i });
    await user.dblClick(submit);

    await waitFor(() => expect(postAgencyOnboarding).toHaveBeenCalledTimes(1));
    expect(submit).toBeDisabled();
  });
});
