/** TCK-2973 — l'onglet « Engagements » : les puces partent au serveur (`filter[role]`, `filter[etat]`), les groupes, une ligne ouvre son fil. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { withIntl } from '@/test/intl';

const apiRequest = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
const { EngagementsDeLaMessagerie, groupeDe } = await import('../EngagementsDeLaMessagerie');

const ligne = (id: number, title: string, etat: string, due_at: string) => ({
  id, title, etat, due_at, holder: { id: 30, name: 'Astou Sy' }, beneficiary: null, conversation: { id: 100 + id, title: 'Fuite sous évier' },
});

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockResolvedValue({
    data: [ligne(1, 'Passer jeudi', 'late', '2020-01-01T10:00:00Z'), ligne(2, 'Envoyer le devis', 'open', '2099-01-01T10:00:00Z')],
    meta: { counts: { owed: 2, mine: 1, late: 1 } },
  });
});

function monter(onOuvrir = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(<QueryClientProvider client={client}><EngagementsDeLaMessagerie onOuvrir={onOuvrir} /></QueryClientProvider>));
  return onOuvrir;
}

it('« On me doit » par défaut, puis chaque puce envoie son filtre au serveur', async () => {
  monter();
  await screen.findByTestId('groupe-retard');
  expect(apiRequest.mock.calls.at(-1)?.[0]).toBe('/api/commitments?filter%5Brole%5D=owed&per_page=50');
  for (const [nom, attendu] of [
    [/Les miens/, 'filter%5Brole%5D=mine'],
    [/Tenus/, 'filter%5Betat%5D=kept'],
    [/Annulés/, 'filter%5Betat%5D=cancelled'],
  ] as const) {
    fireEvent.click(screen.getByRole('button', { name: nom }));
    await waitFor(() => expect(String(apiRequest.mock.calls.at(-1)?.[0])).toContain(attendu));
  }
  fireEvent.click(screen.getByRole('button', { name: /^Tous/ }));
  await waitFor(() => expect(apiRequest.mock.calls.at(-1)?.[0]).toBe('/api/commitments?per_page=50'));
});

it('les comptes des puces lisent meta.counts ; le retard en tête, en encre d’alerte ; une ligne ouvre son fil', async () => {
  const onOuvrir = monter();
  const retard = await screen.findByTestId('groupe-retard');
  expect(screen.getByRole('button', { name: /On me doit/ })).toHaveTextContent('2');
  expect(within(retard).getByText('En retard · 1').className).toContain('text-destructive');
  fireEvent.click(within(retard).getByRole('button', { name: /Passer jeudi/ }));
  expect(onOuvrir).toHaveBeenCalledWith(101);
});

it('groupeDe : en retard, aujourd’hui, cette semaine, plus tard, à l’heure de Dakar', () => {
  const m = new Date('2026-11-19T08:00:00Z');
  expect(groupeDe({ etat: 'open', due_at: '2026-11-19T07:00:00Z' }, m)).toBe('retard');
  expect(groupeDe({ etat: 'open', due_at: '2026-11-19T23:59:59Z' }, m)).toBe('aujourdhui');
  expect(groupeDe({ etat: 'proposed', due_at: '2026-11-22T10:00:00Z' }, m)).toBe('semaine');
  expect(groupeDe({ etat: 'open', due_at: '2026-12-22T10:00:00Z' }, m)).toBe('plusTard');
  expect(groupeDe({ etat: 'kept', due_at: '2026-11-01T10:00:00Z' }, m)).toBe('clos');
});

it('forme « tableau » (bureau) : cinq colonnes, l’objet rattaché en mots, le retard en encre d’alerte, une ligne ouvre son fil une fois', async () => {
  apiRequest.mockResolvedValue({
    data: [{ ...ligne(1, 'Passer jeudi', 'late', '2020-01-01T10:00:00Z'), object: { type: 'maintenance_request', id: 9 } }, ligne(2, 'Envoyer le devis', 'open', '2099-01-01T10:00:00Z')],
    meta: { counts: { owed: 2, mine: 1, late: 1 } },
  });
  const onOuvrir = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(<QueryClientProvider client={client}><EngagementsDeLaMessagerie onOuvrir={onOuvrir} forme="tableau" /></QueryClientProvider>));
  const tableau = await screen.findByTestId('tableau-des-engagements');
  expect(within(tableau).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Qui s’engage', 'Engagement', 'Échéance', 'Rattaché à', 'État']);
  const [, premiere, seconde] = within(tableau).getAllByRole('row');
  expect(premiere).toHaveTextContent('Intervention');
  expect(within(premiere).getByText('En retard').className).toContain('text-destructive');
  expect(seconde).toHaveTextContent('—');
  fireEvent.click(within(premiere).getByRole('button', { name: /Passer jeudi/ }));
  expect(onOuvrir).toHaveBeenCalledTimes(1);
  expect(onOuvrir).toHaveBeenCalledWith(101);
});
