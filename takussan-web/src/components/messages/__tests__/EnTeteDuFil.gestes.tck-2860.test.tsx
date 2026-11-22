/**
 * TCK-2860 — le menu « ⋯ » du bureau (maquette a/2, l. 487-498) : sourdine, « Marquer comme non lue »,
 * « Ajouter un participant » (fil direct seulement), séparateur, « Signaler la conversation » ; sans
 * gestes (widget flottant), le menu d'avant. Au bureau, un groupe a sa sourdine en bouton direct
 * (maquette e5, l. 951).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import type { Conversation } from '@/types/message';
import { EnTeteDuFil } from '../EnTeteDuFil';
import type { GestesDuFil } from '../GestesDuFil';

const sourdine = vi.fn();
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock('@/lib/queries/conversations', () => ({
  useConversationContext: () => ({ data: { data: { property: null, lease: null, maintenance: null } } }),
  useConsignerGesteDuClient: () => ({ mutateAsync: vi.fn(() => Promise.resolve()), isPending: false }),
  useToggleMute: () => ({ mutate: sourdine }),
}));
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMaxWidth: () => false, useMatchesMedia: () => false }));

const participant = (id: number, nom: string) => ({
  id: id * 10,
  user_id: id,
  role: 'member',
  last_read_at: null,
  joined_at: '',
  left_at: null,
  user: { id, full_name: nom, avatar_url: null },
});
const directe = {
  id: 7,
  type: 'direct',
  subject: null,
  maintenance_request_id: null,
  participants: [participant(1, 'Sokhna Sène'), participant(2, 'Malick Seck')],
} as unknown as Conversation;
const groupe = { ...directe, type: 'group', subject: 'Fuite sous évier' } as unknown as Conversation;

let gestes: { onMarquerNonLue: ReturnType<typeof vi.fn>; onAjouterUnParticipant: ReturnType<typeof vi.fn>; onSignaler: ReturnType<typeof vi.fn> };

function monter(conversation: Conversation, avecGestes = true, props: { sourdine?: boolean } = {}) {
  return render(
    withIntl(
      <EnTeteDuFil
        conversationId={conversation.id}
        conversation={conversation}
        sourdine={props.sourdine ?? false}
        onInfosDuGroupe={() => {}}
        contexte={{ ouvert: true, onBasculer: () => {} }}
        gestes={avecGestes ? (gestes as unknown as GestesDuFil) : undefined}
      />,
    ),
  );
}

beforeEach(() => {
  sourdine.mockReset();
  gestes = { onMarquerNonLue: vi.fn(), onAjouterUnParticipant: vi.fn(), onSignaler: vi.fn() };
});

describe('<EnTeteDuFil> — les gestes du « ⋯ » (TCK-2860)', () => {
  it('fil direct : sourdine, non lue, ajouter, puis « Signaler la conversation » après un séparateur', async () => {
    monter(directe);
    await userEvent.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    const items = (await screen.findAllByRole('menuitem')).map((i) => i.textContent);
    expect(items).toEqual(['Couper les notifications', 'Marquer comme non lue', 'Ajouter un participant', 'Signaler la conversation']);
    expect(document.querySelector('[data-slot="dropdown-menu-separator"]')).not.toBeNull();
  });

  it('AC3 — « Marquer comme non lue » appelle le geste de la page, et dit son échec sous l’en-tête', async () => {
    gestes.onMarquerNonLue.mockImplementation(({ onError }: { onError: (e: unknown) => void }) => onError(new Error('x')));
    monter(directe);
    await userEvent.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Marquer comme non lue' }));
    expect(gestes.onMarquerNonLue).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('erreur-de-l-en-tete')).toBeInTheDocument();
  });

  it('« Ajouter un participant » et « Signaler » appellent leurs gestes', async () => {
    monter(directe);
    await userEvent.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Ajouter un participant' }));
    expect(gestes.onAjouterUnParticipant).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Signaler la conversation' }));
    expect(gestes.onSignaler).toHaveBeenCalledTimes(1);
  });

  it('un groupe : pas d’« Ajouter un participant » dans le menu (ses infos le portent)', async () => {
    monter(groupe);
    await userEvent.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await screen.findByRole('menuitem', { name: 'Signaler la conversation' });
    expect(screen.queryByRole('menuitem', { name: 'Ajouter un participant' })).toBeNull();
  });

  it('sans gestes (widget flottant) : le menu d’avant', async () => {
    monter(directe, false);
    await userEvent.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    expect((await screen.findAllByRole('menuitem')).map((i) => i.textContent)).toEqual(['Couper les notifications']);
  });

  it('au bureau, un groupe a la sourdine en bouton direct ; un fil direct, non', async () => {
    const { unmount } = monter(groupe);
    await userEvent.click(screen.getByTestId('sourdine-du-groupe'));
    expect(sourdine).toHaveBeenLastCalledWith({ is_muted: true }, expect.anything());
    unmount();
    monter(directe);
    expect(screen.queryByTestId('sourdine-du-groupe')).toBeNull();
  });
});
