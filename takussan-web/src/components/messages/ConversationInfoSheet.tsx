'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BellOff, Bell, Loader2, LogOut, Save } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ParticipantPicker } from './ParticipantPicker';
import { AlerteErreurs, phrasesDeValidation } from './erreursDeValidation';
import { ParticipantRow } from './ParticipantRow';
import {
  useAddParticipants,
  useRemoveParticipant,
  useRenameConversation,
  useToggleMute,
  useUpdateParticipantRole,
} from '@/lib/queries/conversations';
import { useAuth } from '@/context/AuthContext';
import type { Conversation, ConversationParticipant } from '@/types/message';
import type { MessagingContact } from '@/lib/queries/conversations';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

/** Taille maximale d'un groupe, créateur compris — la borne de `AddParticipantsRequest`. */
const MAX_GROUP_SIZE = 20;

interface ConversationInfoSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly conversation: Conversation | undefined;
  readonly currentMute: boolean;
}

/**
 * TCK-085 — Right panel showing the participant list of a group conversation,
 * with admin actions (rename / promote / remove / add) and self actions
 * (mute / leave).
 */
export function ConversationInfoSheet({
  open,
  onClose,
  conversation,
  currentMute,
}: ConversationInfoSheetProps) {
  const t = useTranslations('messaging.group.info');
  const tCreation = useTranslations('messaging.group.create');
  const messageErreur = useMessageErreurApi();
  const { user } = useAuth();
  const conversationId = conversation?.id ?? 0;

  const rename = useRenameConversation(conversationId);
  const addParticipants = useAddParticipants(conversationId);
  const removeParticipant = useRemoveParticipant(conversationId);
  const updateRole = useUpdateParticipantRole(conversationId);
  const toggleMute = useToggleMute(conversationId);

  const [subject, setSubject] = useState(conversation?.subject ?? '');
  const [erreurs, setErreurs] = useState<string[]>([]);
  const setError = (phrase: string | null) => setErreurs(phrase ? [phrase] : []);

  const participants: ConversationParticipant[] =
    (conversation?.participants ?? []).filter((p) => !p.left_at);

  const myParticipant = participants.find((p) => p.user_id === user?.id);
  const isAdmin = myParticipant?.role === 'admin';
  const isLastAdmin =
    isAdmin && participants.filter((p) => p.role === 'admin').length === 1;

  function handleRename() {
    setError(null);
    if (subject.trim().length === 0) return;
    rename.mutate(
      { subject: subject.trim() },
      {
        onError: (err) =>
          setErreurs(phrasesDeValidation(err) ?? [messageErreur(err, t('renameFailed'))]),
      },
    );
  }

  /**
   * TCK-565 — l'invitation se fait PAR LE NOM, comme à la création du groupe (M12 du retour
   * testeur du 2026-09-23). Ce champ était lui aussi un `<input type="number">` « ID
   * utilisateur ». Choisir une personne l'ajoute aussitôt : il n'y a pas d'étape à valider.
   */
  function handleAdd(contact: MessagingContact | undefined) {
    setError(null);
    if (!contact) return;
    addParticipants.mutate(
      { user_ids: [contact.id] },
      {
        // Les phrases de l'API, pas le résumé d'une 422 (M13, cf. `phrasesDeValidation`).
        onError: (err) =>
          setErreurs(phrasesDeValidation(err) ?? [messageErreur(err, t('addFailed'))]),
      },
    );
  }

  function handleLeave() {
    if (!user) return;
    if (isLastAdmin) {
      setError(t('lastAdminLeaveBlocked'));
      return;
    }
    removeParticipant.mutate(
      { user_id: user.id },
      {
        onSuccess: () => onClose(),
      },
    );
  }

  return (
    <Sheet open={open} onOpenChange={(v) => (v ? null : onClose())}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>{t('title')}</SheetTitle>
          <SheetDescription>
            {t('subjectLine', { subject: conversation?.subject ?? '—' })}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isAdmin && (
            <div className="space-y-1.5">
              <label className="mb-1 block text-sm font-medium text-muted-foreground" htmlFor="rename-subject">{t('renameLabel')}</label>
              <div className="flex gap-2">
                <Input
                  id="rename-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={120}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  onClick={handleRename}
                  disabled={rename.isPending || subject === (conversation?.subject ?? '')}
                  aria-label={t('renameSave')}
                >
                  {rename.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Save className="size-4" aria-hidden />
                  )}
                </Button>
              </div>
            </div>
          )}

          <Separator />

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              {t('participantsHeading', { count: participants.length })}
            </h3>
            <ul className="divide-y divide-border">
              {participants.map((p) => (
                <ParticipantRow
                  key={p.id}
                  participant={p}
                  isSelf={p.user_id === user?.id}
                  canManage={Boolean(isAdmin)}
                  onRemove={(id) =>
                    removeParticipant.mutate({ user_id: id })
                  }
                  onPromote={(id) =>
                    updateRole.mutate({ user_id: id, role: 'admin' })
                  }
                  onDemote={(id) => updateRole.mutate({ user_id: id, role: 'member' })}
                  busy={removeParticipant.isPending || updateRole.isPending}
                />
              ))}
            </ul>
          </div>

          {isAdmin && (
            <div className="space-y-1.5">
              <label
                className="mb-1 flex items-center gap-2 text-sm font-medium text-muted-foreground"
                htmlFor="add-participant-input"
              >
                {t('addLabel')}
                {addParticipants.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : null}
              </label>
              <ParticipantPicker
                inputId="add-participant-input"
                conversationId={conversationId}
                value={[]}
                excludeIds={participants.map((p) => p.user_id)}
                max={Math.max(0, MAX_GROUP_SIZE - participants.length)}
                onMaxReached={() =>
                  setError(tCreation('maxParticipants', { max: MAX_GROUP_SIZE }))
                }
                onChange={(next) => handleAdd(next.at(-1))}
              />
            </div>
          )}

          <AlerteErreurs erreurs={erreurs} />
        </div>

        <div className="border-t border-border p-4 space-y-2">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
            disabled={toggleMute.isPending}
            onClick={() => toggleMute.mutate({ is_muted: !currentMute })}
          >
            {currentMute ? (
              <Bell className="mr-2 size-4" aria-hidden />
            ) : (
              <BellOff className="mr-2 size-4" aria-hidden />
            )}
            {currentMute ? t('unmute') : t('mute')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start text-destructive hover:text-destructive"
            disabled={removeParticipant.isPending || isLastAdmin}
            onClick={handleLeave}
          >
            <LogOut className="mr-2 size-4" aria-hidden />
            {t('leave')}
          </Button>
          {isLastAdmin && (
            <p className="text-[10px] text-muted-foreground">{t('lastAdminLeaveHint')}</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
