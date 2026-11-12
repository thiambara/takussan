import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { fetchAbsences, revokeAbsence } from '@/lib/queries/agent-crm';
import { withIntl } from '@/test/intl';
import type { AgentAbsence } from '@/types/agent-crm';

import { BandeauDesAbsences } from '../BandeauDesAbsences';

/**
 * TCK-2667 — le bandeau du bureau : qui est absent, jusqu'à quand, à qui vont ses nouvelles
 * affectations. Seule une absence COMMENCÉE (`active`) s'annonce : une absence prévue
 * (`scheduled`), échue ou révoquée n'est pas « en cours ».
 */
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, token: 'jeton', isLoading: false }) }));
vi.mock('@/lib/queries/agent-crm', () => ({
  AGENT_CRM_QUERY_KEY: { absences: (a: number) => ['agent-crm', a, 'absences'] },
  fetchAbsences: vi.fn(),
  revokeAbsence: vi.fn(async () => undefined),
}));

function absence(over: Partial<AgentAbsence>): AgentAbsence {
  return {
    id: 1,
    absent: { id: 5, name: 'Pape Cissé' },
    substitute: { id: 6, name: 'Khady Diallo' },
    starts_at: '2026-11-10T00:00:00Z',
    ends_at: '2026-11-14T00:00:00Z',
    status: 'active',
    reason: null,
    ...over,
  };
}

function monter(onOuvrir = vi.fn()) {
  render(
    withIntl(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <BandeauDesAbsences agencyId={12} onOuvrir={onOuvrir} />
      </QueryClientProvider>,
    ),
  );
  return onOuvrir;
}

beforeEach(() => vi.mocked(fetchAbsences).mockReset());

describe('BandeauDesAbsences', () => {
  it('dit l’absent, la date de retour et le remplaçant ; « Voir l’absence » ouvre sa fiche', async () => {
    vi.mocked(fetchAbsences).mockResolvedValue([absence({})]);
    const user = userEvent.setup();
    const onOuvrir = monter();
    expect(await screen.findByText(/Pape Cissé est absent jusqu’au 14 nov\./)).toBeInTheDocument();
    expect(screen.getByText(/vont à Khady Diallo/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Voir l’absence' }));
    expect(onOuvrir).toHaveBeenCalledWith(5);
  });

  it('sans remplaçant, la phrase s’arrête à la date', async () => {
    vi.mocked(fetchAbsences).mockResolvedValue([absence({ substitute: null })]);
    monter();
    expect(await screen.findByText(/Pape Cissé est absent jusqu’au 14 nov\./)).toBeInTheDocument();
    expect(screen.queryByText(/vont à/)).toBeNull();
  });

  it('une absence prévue, échue ou révoquée ne s’annonce pas', async () => {
    vi.mocked(fetchAbsences).mockResolvedValue([
      absence({ id: 1, status: 'scheduled' }),
      absence({ id: 2, status: 'expired' }),
      absence({ id: 3, status: 'revoked' }),
    ]);
    const { container } = render(
      withIntl(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <BandeauDesAbsences agencyId={12} onOuvrir={vi.fn()} />
        </QueryClientProvider>,
      ),
    );
    await vi.waitFor(() => expect(fetchAbsences).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector('[data-slot="bandeau-des-absences"]')).toBeNull();
  });

  it('TCK-2668 — « qui peut agir à sa place » quand une délégation liée couvre l’absence', async () => {
    vi.mocked(fetchAbsences).mockResolvedValue([absence({ substitute_can_act: true })]);
    monter();
    expect(await screen.findByText(/vont à Khady Diallo, qui peut agir à sa place\./)).toBeInTheDocument();
  });

  it('TCK-2668 — à qui peut déléguer : « Modifier l’absence » et « Terminer l’absence »', async () => {
    const a = absence({});
    vi.mocked(fetchAbsences).mockResolvedValue([a]);
    const onModifier = vi.fn();
    const user = userEvent.setup();
    const onOuvrir = vi.fn();
    render(
      withIntl(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <BandeauDesAbsences agencyId={12} onOuvrir={onOuvrir} onModifier={onModifier} />
        </QueryClientProvider>,
      ),
    );
    await user.click(await screen.findByRole('button', { name: 'Modifier l’absence' }));
    expect(onModifier).toHaveBeenCalledWith(a);
    expect(screen.queryByRole('button', { name: 'Voir l’absence' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Terminer l’absence' }));
    await waitFor(() => expect(revokeAbsence).toHaveBeenCalledWith('jeton', 12, 1));
    await user.click(screen.getByRole('button', { name: 'Pape Cissé est absent jusqu’au 14 nov.' }));
    expect(onOuvrir).toHaveBeenCalledWith(5);
  });
});
