import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { withIntl } from '@/test/intl';

/**
 * TCK-589 — AC13 : le récap de l'agent montre les capacités que lui accordera le RÔLE de son profil
 * — `GET /api/me/agent-profiles/{id}/role-capabilities` —, libellées par `admin.roles.capabilities.*`.
 * Plus aucune table écrite en dur (`ROLE_PERMISSIONS`). Pas `GET /api/me/capabilities` : le profil
 * est encore `draft` pendant l'assistant, et un profil non actif ne confère rien (ADR-0031 §3).
 */
const useAgentRoleCapabilities = vi.fn();
vi.mock('@/hooks/useCan', () => ({
  useAgentRoleCapabilities: (...args: unknown[]) => useAgentRoleCapabilities(...args),
}));
vi.mock('@/app/actions/security', () => ({ phoneSendOtpAction: vi.fn(), phoneVerifyOtpAction: vi.fn() }));
vi.mock('@/app/actions/agent-onboarding', () => ({
  agentSubmitKycAction: vi.fn(),
  agentUpdateSpecializationAction: vi.fn(),
  agentOnboardCompleteAction: vi.fn(),
  getAgentFirstLeadAction: vi.fn().mockResolvedValue({ ok: true, data: { customer: null } }),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { phone: '+221770000000', phone_verified_at: '2026-01-01' }, refreshUser: vi.fn() }),
}));
vi.mock('@/components/ui/toast', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/toast')>()),
  useToast: () => ({ add: vi.fn() }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }) }));
// Le brouillon relu place l'assistant directement sur l'étape 4, le récap.
vi.mock('@/hooks/useWizardDraft', () => ({
  useWizardDraft: () => ({
    draft: {
      step: 3,
      data: {
        phone: { number: '+221770000000', code: '', verified: true },
        kyc: { license_number: '', license_uploaded: false, cni_uploaded: false, photo_uploaded: false, submitted: false },
        specialization: { value: 'luxury', zones: [], saved: true },
      },
    },
    isLoading: false,
    save: vi.fn(),
    flush: vi.fn().mockResolvedValue({ ok: true, ecrit: false }),
    clear: vi.fn().mockResolvedValue(undefined),
  }),
}));

const { AgentOnboardingWizard } = await import('../AgentOnboardingWizard');

describe('récap de l’agent — capacités réelles (AC13)', () => {
  it('rôle personnalisé accordant exactement properties.create et crm.view_all : ces deux libellés, aucun autre', () => {
    useAgentRoleCapabilities.mockReturnValue({
      data: { data: { agency_id: 7, capabilities: ['properties.create', 'crm.view_all'] } },
      isLoading: false,
      isError: false,
    });
    render(withIntl(<AgentOnboardingWizard agentProfileId={11} />));

    expect(useAgentRoleCapabilities).toHaveBeenCalledWith(11);
    const bloc = screen.getByTestId('agent-capabilities');
    const libelles = within(bloc).getAllByRole('listitem').map((li) => li.textContent?.trim());
    expect(libelles).toEqual(['Créer un bien', "Voir tous les contacts de l'agence"]);
    // Groupés par domaine, sous le libellé du domaine.
    expect(within(bloc).getByRole('heading', { name: 'Biens' })).toBeInTheDocument();
    expect(within(bloc).getByRole('heading', { name: 'CRM' })).toBeInTheDocument();
    // Les libellés de l'ancienne table ne reviennent pas.
    expect(within(bloc).queryByText('Programmer des visites')).toBeNull();
  });

  it('sans capacité dans l’agence : un message, pas une liste inventée', () => {
    useAgentRoleCapabilities.mockReturnValue({
      data: { data: { agency_id: 7, capabilities: [] } },
      isLoading: false,
      isError: false,
    });
    render(withIntl(<AgentOnboardingWizard agentProfileId={11} />));
    expect(within(screen.getByTestId('agent-capabilities')).queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByText(/Aucun droit ne vous est encore attribué/)).toBeInTheDocument();
  });
});
