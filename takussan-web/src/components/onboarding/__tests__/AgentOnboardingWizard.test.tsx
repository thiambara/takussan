import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import frMessages from '@/messages/fr.json';

// Mock all server actions before importing the component.
const phoneSendOtpAction = vi.fn();
const phoneVerifyOtpAction = vi.fn();
const agentSubmitKycAction = vi.fn();
const agentUpdateSpecializationAction = vi.fn();
const agentOnboardCompleteAction = vi.fn();
const getAgentFirstLeadAction = vi.fn();

vi.mock('@/app/actions/security', () => ({
  phoneSendOtpAction: (...args: unknown[]) => phoneSendOtpAction(...args),
  phoneVerifyOtpAction: (...args: unknown[]) => phoneVerifyOtpAction(...args),
}));

vi.mock('@/app/actions/agent-onboarding', () => ({
  agentSubmitKycAction: (...args: unknown[]) => agentSubmitKycAction(...args),
  agentUpdateSpecializationAction: (...args: unknown[]) =>
    agentUpdateSpecializationAction(...args),
  agentOnboardCompleteAction: (...args: unknown[]) => agentOnboardCompleteAction(...args),
  getAgentFirstLeadAction: (...args: unknown[]) => getAgentFirstLeadAction(...args),
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
    // TCK-475 — cette doublure rendait `undefined`, et c'était FAUX depuis
    // TCK-465 : `flush()` rend un `ResultatEcritureBrouillon`, plus
    // `Promise<void>`. `undefined` ne simule pas le silence d'avant — c'est une
    // valeur qu'aucun appelant ne sait lire, et elle est restée verte tant que
    // personne ne lisait. Le jour où `WizardReprenable` s'est mis à consulter ce
    // résultat, les trois assistants d'onboarding sont tombés en TypeError.
    // `{ ok: true, ecrit: false }` est ce que la production rend au repos : rien
    // en attente, aucun échec antérieur (`useWizardDraft.ts`, `flush()`).
    flush: vi.fn().mockResolvedValue({ ok: true, ecrit: false }),
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

import { AgentOnboardingWizard } from '../AgentOnboardingWizard';

function withIntl(node: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {node}
    </NextIntlClientProvider>
  );
}

describe('<AgentOnboardingWizard>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentSubmitKycAction.mockResolvedValue({
      ok: true,
      data: {
        id: 11,
        kyc: { status: 'pending_review', submitted_at: null, docs: [] },
      },
    });
    agentUpdateSpecializationAction.mockResolvedValue({
      ok: true,
      data: {
        id: 11,
        specialization: 'luxury',
        intervention_zones: ['Almadies'],
        license_number: null,
      },
    });
    agentOnboardCompleteAction.mockResolvedValue({
      ok: true,
      data: {
        agent_profile: { id: 11, status: 'active' },
        active_profile_id: 'agent:11',
        first_lead: null,
      },
    });
    getAgentFirstLeadAction.mockResolvedValue({
      ok: true,
      data: {
        customer: {
          id: 42,
          first_name: 'Mariama',
          last_name: 'Ba',
          full_name: 'Mariama Ba',
          email: 'mb@example.com',
          phone: '+221770000001',
          pipeline_stage: 'qualified',
        },
      },
    });
  });

  it('navigates through all four steps and calls the agent onboarding actions on completion', async () => {
    render(withIntl(<AgentOnboardingWizard agentProfileId={11} />));

    // Step 1 (phone) — user already verified via the mocked AuthContext,
    // canAdvance returns true. Move forward.
    fireEvent.click(screen.getByRole('button', { name: /Suivant/i }));

    // Step 2 (KYC) — non-blocking per spec, no canAdvance gate.
    fireEvent.click(screen.getByRole('button', { name: /Suivant/i }));

    // Step 3 (specialization & zones) — pick a value via the Base UI Select
    // (combobox + popup listbox), save, then advance.
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/Spécialisation/i));
    const luxuryOption = await screen.findByRole('option', { name: /Luxe/i });
    await user.click(luxuryOption);
    fireEvent.click(screen.getByRole('button', { name: /^Enregistrer$/i }));
    await waitFor(() => {
      expect(agentUpdateSpecializationAction).toHaveBeenCalledWith(
        11,
        expect.objectContaining({ specialization: 'luxury' }),
      );
    });
    fireEvent.click(screen.getByRole('button', { name: /Suivant/i }));

    // Step 4 (welcome) — first lead lookup fires on mount.
    await waitFor(() => {
      expect(getAgentFirstLeadAction).toHaveBeenCalledWith(11);
    });

    fireEvent.click(screen.getByRole('button', { name: /Terminer/i }));

    await waitFor(() => {
      expect(agentOnboardCompleteAction).toHaveBeenCalledWith(11, undefined);
    });

    await waitFor(() => {
      expect(routerPush).toHaveBeenCalledWith('/app');
    });
  });
});
