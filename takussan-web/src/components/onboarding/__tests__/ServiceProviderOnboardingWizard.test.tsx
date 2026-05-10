import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import frMessages from '@/messages/fr.json';

// Mock all server actions before importing the component.
const phoneSendOtpAction = vi.fn();
const phoneVerifyOtpAction = vi.fn();
const spPatchTradesAction = vi.fn();
const spPatchAvailabilityAction = vi.fn();
const spOnboardCompleteAction = vi.fn();

vi.mock('@/app/actions/security', () => ({
  phoneSendOtpAction: (...args: unknown[]) => phoneSendOtpAction(...args),
  phoneVerifyOtpAction: (...args: unknown[]) => phoneVerifyOtpAction(...args),
}));

vi.mock('@/app/actions/service-provider-onboarding', () => ({
  spPatchTradesAction: (...args: unknown[]) => spPatchTradesAction(...args),
  spPatchAvailabilityAction: (...args: unknown[]) => spPatchAvailabilityAction(...args),
  spOnboardCompleteAction: (...args: unknown[]) => spOnboardCompleteAction(...args),
}));

const refreshUser = vi.fn();
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { phone: '+221770000000', phone_verified_at: new Date().toISOString() },
    token: 'token',
    isLoading: false,
    setUser: vi.fn(),
    refreshUser,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
}));

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, prefetch: vi.fn() }),
}));

// `useWizardDraft` autosaves drafts via fetch — short-circuit it so the
// wizard hydrates with empty state and we can step through synchronously.
vi.mock('@/hooks/useWizardDraft', () => ({
  useWizardDraft: () => ({
    draft: null,
    isLoading: false,
    save: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Toast addition is invoked from inside the wizard — stub the provider
// so we can assert on calls without rendering the actual portal.
const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/toast')>();
  return {
    ...actual,
    useToast: () => ({ add: toastAdd }),
  };
});

import { ServiceProviderOnboardingWizard } from '../ServiceProviderOnboardingWizard';

function withIntl(node: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {node}
    </NextIntlClientProvider>
  );
}

describe('<ServiceProviderOnboardingWizard>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    spPatchTradesAction.mockResolvedValue({ ok: true, data: { id: 1 } });
    spPatchAvailabilityAction.mockResolvedValue({ ok: true, data: { id: 1 } });
    spOnboardCompleteAction.mockResolvedValue({
      ok: true,
      data: {
        sp_profile: { id: 42, status: 'active' },
        active_profile_id: 'service_provider:42',
        activated_collaborations: 1,
        redirect_to_maintenance_request_id: 99,
      },
    });
  });

  it('navigates through all steps and calls the SP onboarding actions on completion', async () => {
    render(withIntl(<ServiceProviderOnboardingWizard spProfileId={42} />));

    // Step 1 (phone) — user already verified via the mocked AuthContext,
    // canAdvance returns true. Move forward.
    fireEvent.click(screen.getByRole('button', { name: /Suivant/i }));

    // Step 2 (trades) — pick a trade + add a zone.
    fireEvent.click(screen.getByTestId('trade-plumbing'));

    const zonesInput = screen.getByLabelText(/Zones d'intervention/i);
    fireEvent.change(zonesInput, { target: { value: 'Dakar' } });

    fireEvent.click(screen.getByRole('button', { name: /Suivant/i }));

    // Step 3 (availability) — toggle one slot to satisfy canAdvance.
    fireEvent.click(screen.getByTestId('availability-monday-morning'));
    fireEvent.click(screen.getByRole('button', { name: /Suivant/i }));

    // Step 4 (recap) — final CTA.
    fireEvent.click(screen.getByRole('button', { name: /Terminer/i }));

    await waitFor(() => {
      expect(spPatchTradesAction).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          trades: ['plumbing'],
          intervention_zones: ['Dakar'],
        }),
      );
    });

    expect(spPatchAvailabilityAction).toHaveBeenCalledWith(
      42,
      expect.arrayContaining([
        expect.objectContaining({ day: 'monday', from: '08:00', to: '12:00' }),
      ]),
    );

    expect(spOnboardCompleteAction).toHaveBeenCalledWith(42, undefined);
    await waitFor(() => {
      expect(routerPush).toHaveBeenCalledWith('/app/maintenance/requests/99');
    });
  });
});
