/**
 * TCK-591 §5 — la sélection partagée par WhatsApp ne porte que des liens PUBLICS, au numéro du
 * client, avec le message prérempli (AC15, partie « ouvre WhatsApp sur le bon numéro »).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { CustomerMatches } from '../CustomerMatches';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }),
}));

const fetchMatchingProperties = vi.fn();
vi.mock('@/lib/queries/agent-crm', async (original) => ({
  ...(await original<typeof import('@/lib/queries/agent-crm')>()),
  fetchMatchingProperties: (...args: unknown[]) => fetchMatchingProperties(...args),
}));

const bien = (id: number, title: string, visibility: 'public' | 'private') => ({
  id, title, slug: `bien-${id}`, type: 'apartment', contract_type: 'rent', price: '250000.00',
  bedrooms: 2, visibility, status: 'available', city: 'Dakar', neighborhood: 'Mermoz',
});

describe('CustomerMatches', () => {
  it('envoie au numéro du client les seuls liens publics choisis', async () => {
    fetchMatchingProperties.mockResolvedValueOnce({
      data: [bien(1, 'F3 Mermoz', 'public'), bien(2, 'Villa privée', 'private')],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 2 },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(withIntl(
      <QueryClientProvider client={client}>
        <CustomerMatches customerId={3} firstName="Awa" phone="+221771234567" />
      </QueryClientProvider>,
    ));

    expect(await screen.findByText('2 biens correspondent aux critères.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Villa privée.*n'est pas public/ })).toBeDisabled();

    await userEvent.setup().click(screen.getByRole('checkbox', { name: /F3 Mermoz/ }));

    const lien = screen.getByRole('link', { name: 'Envoyer 1 bien sur WhatsApp' });
    const href = new URL(lien.getAttribute('href') ?? '');
    expect(href.origin + href.pathname).toBe('https://wa.me/221771234567');
    const texte = href.searchParams.get('text') ?? '';
    expect(texte).toContain('Bonjour Awa');
    expect(texte).toContain('/properties/bien-1');
    expect(texte).not.toContain('bien-2');
  });
});
