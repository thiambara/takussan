import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { AgentCommissionRateField } from '../AgentCommissionRateField';
import { useSetAgentCommissionRate } from '@/lib/queries/agency-roles';
import { ApiError } from '@/lib/api';
import type { AgencyRoleAssignment } from '@/types/agency-role';

vi.mock('@/lib/queries/agency-roles', () => ({
  useSetAgentCommissionRate: vi.fn(),
}));

const AGENT: AgencyRoleAssignment = {
  profile_id: 42,
  profile_type: 'agent',
  user_id: 12,
  agency_role_id: 1,
  agency_role_name: 'Agent',
  commission_rate: 12.5,
};

let mutate: ReturnType<typeof vi.fn>;

function mockHook(error: ApiError | null = null) {
  mutate = vi.fn((_vars: unknown, opts?: { onError?: (e: ApiError) => void }) => {
    if (error) opts?.onError?.(error);
  });
  vi.mocked(useSetAgentCommissionRate).mockReturnValue({
    mutate,
    isPending: false,
    error,
  } as unknown as ReturnType<typeof useSetAgentCommissionRate>);
}

/**
 * TCK-2364 (P241.02) — le taux de commission de l'agent, sur sa fiche de membre : la part que le
 * grand livre lui verse sur chaque bail qu'il négocie (ADR-0049 « Ventilation » § 2).
 */
describe('<AgentCommissionRateField>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHook();
  });

  it('affiche le taux en place, sans bouton tant que rien ne change', () => {
    render(withIntl(<AgentCommissionRateField assignment={AGENT} />));

    expect(screen.getByLabelText("Taux de commission de l'agent (%)")).toHaveValue(12.5);
    expect(screen.queryByRole('button', { name: 'Enregistrer le taux' })).toBeNull();
    expect(useSetAgentCommissionRate).toHaveBeenCalledWith(42);
  });

  it('enregistre le taux saisi', async () => {
    const user = userEvent.setup();
    render(withIntl(<AgentCommissionRateField assignment={AGENT} />));

    const champ = screen.getByLabelText("Taux de commission de l'agent (%)");
    await user.clear(champ);
    await user.type(champ, '30');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le taux' }));

    expect(mutate).toHaveBeenCalledWith({ commission_rate: 30 }, expect.anything());
  });

  it('un champ vidé efface le taux', async () => {
    const user = userEvent.setup();
    render(withIntl(<AgentCommissionRateField assignment={AGENT} />));

    await user.clear(screen.getByLabelText("Taux de commission de l'agent (%)"));
    await user.click(screen.getByRole('button', { name: 'Enregistrer le taux' }));

    expect(mutate).toHaveBeenCalledWith({ commission_rate: null }, expect.anything());
  });

  it("un refus s'affiche, et le champ revient au taux en place", async () => {
    const message = 'Le taux doit être compris entre 0 et 100.';
    mockHook(new ApiError(422, { message, errors: { commission_rate: [message] } }));
    const user = userEvent.setup();
    render(withIntl(<AgentCommissionRateField assignment={AGENT} />));

    const champ = screen.getByLabelText("Taux de commission de l'agent (%)");
    await user.clear(champ);
    await user.type(champ, '150');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le taux' }));

    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(champ).toHaveValue(12.5);
  });
});
