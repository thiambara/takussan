/**
 * TCK-1873 (P189.04) — « Me désigner » et « Désigner » le référent d'un client ne s'offrent qu'à qui
 * tient `crm.assign` dans l'agence du client : l'API l'exige (`SetPrimaryContactCustomerRequest`,
 * TCK-591), et le composant montrait les deux gestes à tout lecteur de la fiche.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

const { etat } = vi.hoisted(() => ({ etat: { can: false } }));

vi.mock('@/hooks/useCan', () => ({
  useCan: () => ({ can: etat.can, isLoading: false }),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'jeton', user: { id: 9, roles: ['agent'] } }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/queries/agent-crm', () => ({
  AGENT_CRM_QUERY_KEY: { staff: (id: number) => ['agent-crm', 'staff', id] },
  fetchAgencyAgents: vi.fn(async () => [
    { id: 9, name: 'Moi' },
    { id: 12, name: 'Awa Ndiaye' },
  ]),
  setCustomerPrimaryContact: vi.fn(),
}));

import { CustomerReferent } from '../CustomerReferent';

const r = fr.agentCrm.referent;

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <CustomerReferent customerId={5} agencyId={3} relationships={[]} />
      </QueryClientProvider>,
    ),
  );
}

describe('<CustomerReferent> — gestes sous `crm.assign`', () => {
  beforeEach(() => {
    etat.can = false;
  });

  it('sans `crm.assign`, ni « Me désigner » ni « Désigner » ; le référent reste lisible', async () => {
    rendre();

    expect(screen.getByRole('heading', { name: r.title })).toBeInTheDocument();
    expect(screen.getByText(r.none)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: r.me })).not.toBeInTheDocument();
    // Le sélecteur n'apparaît qu'une fois la liste des agents arrivée : on laisse sa chance.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('button', { name: r.designate })).not.toBeInTheDocument();
  });

  it('avec `crm.assign`, les deux gestes', async () => {
    etat.can = true;
    rendre();

    expect(screen.getByRole('button', { name: r.me })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: r.designate })).toBeInTheDocument();
  });
});
