/**
 * TCK-2815 — la liste des clients : une page au-delà de la dernière (un lien gardé, une liste qui a
 * diminué) ne dit plus « Pas encore de clients » ni « Aucun client ici ». La densité y est déjà lue
 * et transmise (`parPageDeLUrl`, TCK-2590) : hors du ticket.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/ui/toast';
import { withIntl } from '@/test/intl';
import { navigationDeTest } from '@/test/navigation-url';
import fr from '@/messages/fr.json';
import type { PaginatedResponse } from '@/types/api';
import type { CustomerListItem } from '@/types/customer';

vi.mock('next/navigation', async () => (await import('@/test/navigation-url')).moduleNavigation);
vi.mock('@/lib/queries/customer-gestures', () => ({
  useEnregistrerContactClient: () => ({ mutate: vi.fn(), isError: false }),
  useDesignerReferent: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ListeDesClients, type ListeDesClientsProps } from '../ListeDesClients';

const t = fr.console.pagination.pageAuDela;
const VIDES = [fr.crm.list.vide.title, fr.crm.list.vide.description, fr.crm.list.videFiltre.title, fr.crm.list.videFiltre.description];

function page(total: number, courante: number): PaginatedResponse<CustomerListItem> {
  return {
    data: [],
    meta: { total, current_page: courante, last_page: Math.max(1, Math.ceil(total / 20)), per_page: 20 },
    links: { first: null, last: null, prev: null, next: null },
  };
}

const AGENT: Omit<ListeDesClientsProps, 'page' | 'filtre'> = {
  vue: 'tous',
  tri: 'next_action_at',
  vues: ['a-relancer', 'mes-clients', 'negociation', 'tous'],
  comptes: { tous: 12 },
  personnel: true,
  admin: false,
  crmTags: [],
};

function monter(props: ListeDesClientsProps) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}><ToastProvider><ListeDesClients {...props} /></ToastProvider></QueryClientProvider>));
}

beforeEach(() => navigationDeTest.reinitialiser(''));

describe('TCK-2815 — liste des clients', () => {
  it.each([false, true])('AC2 — ?page=9, data: [], total 12 (filtre : %s) : « au-delà de la dernière page », aucun texte d’état vide', async (filtre) => {
    const user = userEvent.setup();
    navigationDeTest.reinitialiser(filtre ? 'search=fall&page=9' : 'page=9');
    monter({ ...AGENT, page: page(12, 9), filtre });

    expect(screen.getByText(t.title)).toBeInTheDocument();
    for (const texte of VIDES) expect(screen.queryByText(texte)).toBeNull();

    await user.click(screen.getByRole('button', { name: t.premiere }));
    const adresse = new URLSearchParams(navigationDeTest.requete());
    expect(adresse.get('page')).toBeNull();
    expect(adresse.get('search')).toBe(filtre ? 'fall' : null);
  });

  it('AC3 — data: [], total 0 : « Pas encore de clients », sans « au-delà »', () => {
    monter({ ...AGENT, page: page(0, 1), filtre: false });
    expect(screen.getByText(fr.crm.list.vide.title)).toBeInTheDocument();
    expect(screen.queryByText(t.title)).toBeNull();
  });

  it('AC3 — data: [], total 0 sous un filtre : « Aucun client ici », sans « au-delà »', () => {
    monter({ ...AGENT, page: page(0, 1), filtre: true });
    expect(screen.getByText(fr.crm.list.videFiltre.title)).toBeInTheDocument();
    expect(screen.queryByText(t.title)).toBeNull();
  });
});
