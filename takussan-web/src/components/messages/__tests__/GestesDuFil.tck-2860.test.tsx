/**
 * TCK-2860 — les dialogues des gestes du « ⋯ » (routes de TCK-2859, ADR-0114) :
 *  · « Signaler la conversation » : un motif obligatoire, un commentaire facultatif, `POST …/reports`,
 *    puis « Conversation signalée » ; 409 `conversation.already_reported` → « déjà signalé » ;
 *  · « Ajouter un participant » à un fil direct : le dialogue dit qu'un NOUVEAU groupe est créé, envoie
 *    les personnes choisies, et ouvre le groupe rendu ; bouton inactif pendant l'envoi.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { ApiError } from '@/lib/api';
import { DialogueElargirLeFil, DialogueSignaler } from '../GestesDuFil';

type Rappels = { onSuccess?: (r: unknown) => void; onError?: (e: unknown) => void };
const signaler = vi.fn<(v: unknown, r: Rappels) => void>();
const elargir = vi.fn<(v: unknown, r: Rappels) => void>();
let elargirEnCours = false;

vi.mock('@/lib/queries/conversations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/conversations')>()),
  useReportConversation: () => ({ mutate: signaler, isPending: false }),
  useElargirLeFilDirect: () => ({ mutate: elargir, isPending: elargirEnCours }),
}));
vi.mock('../ParticipantPicker', () => ({
  ParticipantPicker: ({ onChange, excludeIds, conversationId }: { onChange: (p: unknown[]) => void; excludeIds: number[]; conversationId: number }) => (
    <button type="button" data-exclus={excludeIds.join(',')} data-fil={conversationId} onClick={() => onChange([{ id: 44, name: 'Astou Sy', avatar_url: null }])}>
      choisir Astou Sy
    </button>
  ),
}));

beforeEach(() => {
  signaler.mockReset();
  elargir.mockReset();
  elargirEnCours = false;
});

describe('<DialogueSignaler> (TCK-2860, AC4)', () => {
  it('sans motif, rien ne part ; avec motif et commentaire, le signalement part puis « Conversation signalée »', async () => {
    signaler.mockImplementation((_v, r) => r.onSuccess?.({}));
    render(withIntl(<DialogueSignaler conversationId={7} open onOpenChange={() => {}} />));
    await userEvent.click(screen.getByRole('button', { name: 'Signaler' }));
    expect(signaler).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Choisissez un motif.');

    await userEvent.click(screen.getByRole('radio', { name: 'Harcèlement' }));
    await userEvent.type(screen.getByLabelText('Précisez (facultatif)'), '  insultes  ');
    await userEvent.click(screen.getByRole('button', { name: 'Signaler' }));
    expect(signaler).toHaveBeenCalledWith({ reason: 'harassment', comment: 'insultes' }, expect.anything());
    expect(await screen.findByText('Conversation signalée')).toBeInTheDocument();
  });

  it('déjà signalée (409 `conversation.already_reported`) : on le dit', async () => {
    signaler.mockImplementation((_v, r) => r.onError?.(new ApiError(409, { code: 'conversation.already_reported', message: 'x' })));
    render(withIntl(<DialogueSignaler conversationId={7} open onOpenChange={() => {}} />));
    await userEvent.click(screen.getByRole('radio', { name: 'Messages indésirables' }));
    await userEvent.click(screen.getByRole('button', { name: 'Signaler' }));
    expect(signaler).toHaveBeenCalledWith({ reason: 'spam' }, expect.anything());
    expect(await screen.findByText('Vous avez déjà signalé cette conversation.')).toBeInTheDocument();
    expect(screen.queryByText('Conversation signalée')).toBeNull();
  });

  it('un autre échec se dit, et le formulaire reste', async () => {
    signaler.mockImplementation((_v, r) => r.onError?.(new ApiError(500, null)));
    render(withIntl(<DialogueSignaler conversationId={7} open onOpenChange={() => {}} />));
    await userEvent.click(screen.getByRole('radio', { name: 'Autre' }));
    await userEvent.click(screen.getByRole('button', { name: 'Signaler' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Signaler' })).toBeInTheDocument();
  });
});

describe('<DialogueElargirLeFil> (TCK-2860, ADR-0114)', () => {
  it('dit qu’un nouveau groupe est créé, envoie les personnes, puis ouvre le groupe rendu', async () => {
    elargir.mockImplementation((_v, r) => r.onSuccess?.({ data: { id: 501 } }));
    const onCree = vi.fn();
    const onOpenChange = vi.fn();
    render(
      withIntl(
        <DialogueElargirLeFil conversationId={7} nomDeLAutre="Malick Seck" exclus={[9, 1]} open onOpenChange={onOpenChange} onCree={onCree} />,
      ),
    );
    expect(screen.getByText(/Un nouveau groupe sera créé avec Malick Seck/)).toBeInTheDocument();
    const choisir = screen.getByRole('button', { name: 'choisir Astou Sy' });
    // La liste est celle de l'ajout à CE fil, sans l'autre partie ni soi-même.
    expect(choisir).toHaveAttribute('data-fil', '7');
    expect(choisir).toHaveAttribute('data-exclus', '9,1');

    await userEvent.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    expect(elargir).not.toHaveBeenCalled();
    await userEvent.click(choisir);
    await userEvent.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    expect(elargir).toHaveBeenCalledWith({ user_ids: [44] }, expect.anything());
    expect(onCree).toHaveBeenCalledWith(501);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('pendant l’envoi, le bouton est inactif (un double envoi créerait deux groupes)', () => {
    elargirEnCours = true;
    render(
      withIntl(<DialogueElargirLeFil conversationId={7} nomDeLAutre="Malick Seck" exclus={[9]} open onOpenChange={() => {}} onCree={() => {}} />),
    );
    expect(screen.getByRole('button', { name: 'Créer le groupe' })).toBeDisabled();
  });

  it('un refus 422 dit ses phrases', async () => {
    elargir.mockImplementation((_v, r) =>
      r.onError?.(new ApiError(422, { message: 'x', errors: { user_ids: ['Cette personne ne peut pas être ajoutée.'] } })),
    );
    render(
      withIntl(<DialogueElargirLeFil conversationId={7} nomDeLAutre="Malick Seck" exclus={[9]} open onOpenChange={() => {}} onCree={() => {}} />),
    );
    await userEvent.click(screen.getByRole('button', { name: 'choisir Astou Sy' }));
    await userEvent.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Cette personne ne peut pas être ajoutée.');
  });
});
