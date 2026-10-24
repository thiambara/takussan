/**
 * P228.05 (TCK-2218) — dans les informations d'un groupe, le retrait d'un participant, le départ,
 * le changement de rôle et la sourdine disent leur refus dans la zone d'erreur que l'écran a déjà
 * (`AlerteErreurs`), par `useMessageErreurApi()` (ADR-0019). Avant, seuls le renommage et l'ajout
 * le faisaient : un 404 (participant déjà parti) ou un 422 (dernier administrateur, sur un écran
 * périmé) ne disait rien.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { withIntl } from '@/test/intl';
import type { Conversation } from '@/types/message';
import { ConversationInfoSheet } from '../ConversationInfoSheet';

const MESSAGE_API = 'Ce participant a déjà quitté le groupe.';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton' }),
}));

const { mutations } = vi.hoisted(() => ({
  mutations: {
    retrait: { isPending: false, mutate: vi.fn() },
    role: { isPending: false, mutate: vi.fn() },
    sourdine: { isPending: false, mutate: vi.fn() },
  },
}));

vi.mock('@/lib/queries/conversations', async (original) => ({
  ...(await original<typeof import('@/lib/queries/conversations')>()),
  useRemoveParticipant: () => mutations.retrait,
  useUpdateParticipantRole: () => mutations.role,
  useToggleMute: () => mutations.sourdine,
}));

const PARTICIPANT = { is_muted: false, last_read_at: null, joined_at: '2026-09-01T00:00:00+00:00', left_at: null };

const GROUPE = {
  id: 12,
  subject: 'Travaux',
  type: 'group',
  participants: [
    { ...PARTICIPANT, id: 1, user_id: 1, role: 'admin', user: { id: 1, full_name: 'Fatou Diop', avatar_url: null } },
    { ...PARTICIPANT, id: 2, user_id: 5, role: 'admin', user: { id: 5, full_name: 'Awa Sarr', avatar_url: null } },
    { ...PARTICIPANT, id: 3, user_id: 6, role: 'member', user: { id: 6, full_name: 'Moussa Ndiaye', avatar_url: null } },
  ],
} as unknown as Conversation;

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={client}>
        <ConversationInfoSheet open onClose={() => {}} conversation={GROUPE} currentMute={false} />
      </QueryClientProvider>,
    ),
  );
}

describe('<ConversationInfoSheet> — les gestes refusés se disent (P228.05)', () => {
  beforeEach(() => {
    for (const m of Object.values(mutations)) {
      m.mutate.mockReset();
      m.mutate.mockImplementation(
        (_vars: unknown, options?: { onError?: (erreur: unknown) => void }) =>
          options?.onError?.(new ApiError(404, { message: MESSAGE_API })),
      );
    }
  });

  it('retrait d’un participant', async () => {
    rendre();
    await userEvent.click(screen.getAllByRole('button', { name: 'Retirer du groupe' })[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_API);
  });

  it('promotion', async () => {
    rendre();
    await userEvent.click(screen.getByRole('button', { name: 'Promouvoir admin' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_API);
  });

  it('rétrogradation', async () => {
    rendre();
    await userEvent.click(screen.getAllByRole('button', { name: 'Rétrograder en membre' })[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_API);
  });

  it('sourdine', async () => {
    rendre();
    await userEvent.click(screen.getByRole('button', { name: 'Couper les notifications' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_API);
  });

  it('départ du groupe', async () => {
    rendre();
    await userEvent.click(screen.getByRole('button', { name: 'Quitter le groupe' }));
    expect(mutations.retrait.mutate).toHaveBeenCalledWith({ user_id: 1 }, expect.anything());
    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_API);
  });
});
