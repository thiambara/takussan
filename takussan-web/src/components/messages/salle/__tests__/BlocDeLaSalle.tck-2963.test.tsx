/**
 * TCK-2963 (AC1) — l'entrée depuis la fiche : le bloc ouvre la salle de CET objet par
 * `POST /api/conversations/rooms`, et « Ouvrir la salle » mène à la conversation que l'API a rendue. Un 403
 * (le lecteur n'est pas partie) ne laisse rien à l'écran.
 */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { withIntl } from '@/test/intl';

import { AGENT, message, salleDeLaReservation, salleDuBail } from './donnees';

const apiRequest = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: AGENT, roles: [] }, token: 'jeton' }) }));

const { BlocDeLaSalle } = await import('../BlocDeLaSalle');

function monter(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>));
}

const pageDeMessages = (data: unknown[]) => ({ data, meta: { has_more: false } });

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation((chemin: string, options?: { body?: { subject_type: string; subject_id: number } }) => {
    if (chemin === '/api/conversations/rooms') {
      const corps = options?.body;
      if (corps?.subject_type === 'lease' && corps.subject_id === 12) return Promise.resolve({ data: salleDuBail() });
      if (corps?.subject_type === 'booking' && corps.subject_id === 7) return Promise.resolve({ data: salleDeLaReservation() });
      return Promise.reject(new ApiError(403, { message: 'Refusé' }));
    }
    if (chemin.startsWith('/api/conversations/90/messages')) {
      return Promise.resolve(
        pageDeMessages([
          message('text', '2026-11-18T09:52:00Z', { sender_id: AGENT, sender: { id: AGENT, full_name: 'Sokhna Sène' }, content: 'Oui, c’est le loyer de l’avenant.' }),
          message('event', '2026-11-18T09:45:00Z'),
          message('text', '2026-11-18T09:40:00Z', { content: 'Le loyer de décembre passe bien à 470 000 F ?' }),
          message('text', '2026-11-17T09:40:00Z', { content: 'Un message plus ancien' }),
        ]),
      );
    }
    if (chemin.startsWith('/api/conversations/91/messages')) return Promise.resolve(pageDeMessages([]));
    return Promise.reject(new Error(`inattendu : ${chemin}`));
  });
});

describe('<BlocDeLaSalle> (TCK-2963)', () => {
  it('ouvre la salle DU bail de la fiche et y mène', async () => {
    monter(<BlocDeLaSalle nature="lease" id={12} />);

    const lien = await screen.findByRole('link', { name: 'Ouvrir la salle' });
    expect(lien).toHaveAttribute('href', '/app/messages?conversation=90');
    expect(apiRequest).toHaveBeenCalledWith('/api/conversations/rooms', expect.objectContaining({ method: 'POST', body: { subject_type: 'lease', subject_id: 12 } }));
    expect(screen.getByText('Salle du bail')).toBeInTheDocument();
  });

  it('montre les deux derniers messages de membres, jamais un événement', async () => {
    monter(<BlocDeLaSalle nature="lease" id={12} />);

    const lignes = await screen.findAllByTestId('dernier-message-de-la-salle');
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toHaveTextContent('Ousmane Niang');
    expect(lignes[0]).toHaveTextContent('Le loyer de décembre passe bien à 470 000 F ?');
    expect(lignes[1]).toHaveTextContent('Vous');
    expect(screen.queryByText('Un message plus ancien')).toBeNull();
  });

  it('ouvre la salle DE la réservation et y mène', async () => {
    monter(<BlocDeLaSalle nature="booking" id={7} />);

    const lien = await screen.findByRole('link', { name: 'Ouvrir la salle' });
    expect(lien).toHaveAttribute('href', '/app/messages?conversation=91');
    expect(apiRequest).toHaveBeenCalledWith('/api/conversations/rooms', expect.objectContaining({ method: 'POST', body: { subject_type: 'booking', subject_id: 7 } }));
    expect(screen.getByText('Salle de la réservation')).toBeInTheDocument();
    expect(await screen.findByText(/Aucun message pour l’instant/)).toBeInTheDocument();
  });

  it('un 403 ne laisse aucun bloc', async () => {
    const { container } = monter(<BlocDeLaSalle nature="lease" id={99} />);

    await vi.waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/conversations/rooms', expect.anything()));
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('bloc-de-la-salle')).toBeNull();
  });
});
