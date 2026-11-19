/** TCK-2972 — « Engagements de ce fil » : Ouverts · Tenus · Annulés, depuis `GET …/commitments`. */
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { withIntl } from '@/test/intl';

const apiRequest = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
const { EngagementsDuFil } = await import('../EngagementsDuFil');

const ligne = (id: number, title: string, etat: string) => ({ id, title, etat, due_at: '2099-11-19T10:00:00+00:00', holder: { id: 30, name: 'Astou Sy' }, beneficiary: null, abilities: {} });

it('groupe les engagements par état, le retard en tête des ouverts', async () => {
  apiRequest.mockResolvedValue({
    data: [ligne(1, 'Passer jeudi', 'late'), ligne(2, 'Envoyer le devis', 'open'), ligne(3, 'Valider le devis', 'kept'), ligne(4, 'Photo du siphon', 'cancelled')],
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(<QueryClientProvider client={client}><EngagementsDuFil conversationId={3} /></QueryClientProvider>));
  const ouverts = await screen.findByTestId('engagements-ouverts');
  expect(apiRequest).toHaveBeenCalledWith('/api/conversations/3/commitments', expect.anything());
  expect(within(ouverts).getByText('Ouverts · 2')).toBeTruthy();
  expect(within(ouverts).getByText('En retard').className).toContain('text-destructive');
  expect(within(screen.getByTestId('engagements-tenus')).getByText('Valider le devis')).toBeTruthy();
  expect(within(screen.getByTestId('engagements-annules')).getByText('Photo du siphon')).toBeTruthy();
});

it('aucun engagement : rien', async () => {
  apiRequest.mockResolvedValue({ data: [] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(withIntl(<QueryClientProvider client={client}><EngagementsDuFil conversationId={3} /></QueryClientProvider>));
  await Promise.resolve();
  expect(container.querySelector('[data-testid="engagements-du-fil"]')).toBeNull();
});
