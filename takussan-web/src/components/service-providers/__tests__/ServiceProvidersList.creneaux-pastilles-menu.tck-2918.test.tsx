/**
 * TCK-2918 (e8, AC8) — le carnet des prestataires : « 1 créneau dépassé » (`overdue_slots_count`,
 * ADR-0118 § 4) sur la ligne et sur la carte ; au téléphone, les pastilles de métier portent le compte
 * de `meta.trade_counts` ; au bureau, chaque ligne a son menu « ⋯ ».
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { ServiceProviderProfileSummary } from '@/lib/queries/service-providers';

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: vi.fn(async () => donnees),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, token: 'jeton', isLoading: false }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

function ligne(extra: Partial<ServiceProviderProfileSummary>): ServiceProviderProfileSummary {
  return {
    id: 1,
    user_id: 101,
    status: 'active',
    specialties: ['plumbing'],
    service_areas: ['Hann', 'Patte d’Oie'],
    metadata: null,
    created_at: '2026-11-06T10:00:00Z',
    user: { id: 101, first_name: 'Moussa', last_name: 'Faye', email: 'm@example.test' },
    phone: '+221709152860',
    average_rating: null,
    reviews_count: 0,
    completed_interventions_count: 12,
    response_delay_minutes: 20,
    overdue_slots_count: 1,
    ...extra,
  };
}

const LIGNES: ServiceProviderProfileSummary[] = [
  ligne({}),
  ligne({ id: 2, user_id: 102, specialties: ['painting'], user: { id: 102, first_name: 'Astou', last_name: 'Sy', email: 'a@example.test' }, phone: '+221775384106', overdue_slots_count: 0 }),
  ligne({ id: 3, user_id: null, status: 'draft', specialties: ['plumbing'], user: null, metadata: { first_name: 'Pape', last_name: 'Sarr' }, phone: null, overdue_slots_count: 0, pending_invitation_id: 9 }),
];

const donnees = {
  data: LIGNES,
  meta: { total: 3, current_page: 1, last_page: 1, per_page: 100, zones: ['Hann'], trade_counts: { painting: 1, plumbing: 2 } },
} as never;

const { ServiceProvidersList } = await import('../ServiceProvidersList');

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={client}>
        <ServiceProvidersList agencyId={7} canInvite initialData={donnees} />
      </QueryClientProvider>,
    ),
  );
  return userEvent.setup();
}

const ligneDe = (nom: string) => within(screen.getByRole('table')).getByText(nom).closest('tr')!;

describe('Carnet — créneaux dépassés, pastilles comptées, « ⋯ » (TCK-2918)', () => {
  it('« 1 créneau dépassé » sur la ligne et sur la carte de Moussa Faye, rien pour Astou Sy', async () => {
    rendre();
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    expect(within(ligneDe('Moussa Faye')).getByText('1 créneau dépassé')).toBeInTheDocument();
    expect(within(ligneDe('Astou Sy')).queryByText(/dépassé/)).toBeNull();
    const cartes = [...document.querySelectorAll<HTMLElement>('[data-slot="carte-prestataire"]')];
    expect(cartes.find((c) => c.textContent?.includes('Moussa Faye'))?.textContent).toMatch(/· 1 créneau dépassé/);
    expect(cartes.find((c) => c.textContent?.includes('Astou Sy'))?.textContent).not.toMatch(/dépassé/);
  });

  it('au téléphone, les pastilles de métier portent le compte de `meta.trade_counts`', async () => {
    rendre();
    const pastilles = await screen.findByRole('group', { name: 'Métier' });
    expect(within(pastilles).getByRole('button', { name: /Plomberie\s*2/ })).toBeInTheDocument();
    expect(within(pastilles).getByRole('button', { name: /Peinture\s*1/ })).toBeInTheDocument();
  });

  it('au bureau, chaque ligne a son « ⋯ » : appeler et WhatsApp pour un actif, renvoyer et révoquer pour une invitation', async () => {
    const u = rendre();
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    const lignes = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(lignes).toHaveLength(3);
    for (const l of lignes) expect(l.querySelector('[data-slot="menu-de-ligne"]')).not.toBeNull();

    await u.click(within(ligneDe('Moussa Faye')).getByRole('button', { name: 'Plus d’actions pour Moussa Faye' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Appeler Moussa Faye' }).getAttribute('href')).toBe('tel:+221709152860');
    expect(within(menu).getByRole('menuitem', { name: 'Écrire à Moussa Faye sur WhatsApp' })).toBeInTheDocument();
    await u.keyboard('{Escape}');

    await u.click(within(ligneDe('Pape Sarr')).getByRole('button', { name: 'Plus d’actions pour Pape Sarr' }));
    const menuInvitation = await screen.findByRole('menu');
    expect(within(menuInvitation).getByRole('menuitem', { name: /Renvoyer l'invitation/ })).toBeInTheDocument();
    expect(within(menuInvitation).getByRole('menuitem', { name: /Révoquer/ })).toBeInTheDocument();
  });
});
