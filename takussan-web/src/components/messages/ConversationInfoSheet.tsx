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
import { AlerteErreurs } from './erreursDeValidation';
import { ParticipantRow } from './ParticipantRow';
import type { Conversation } from '@/types/message';
import { MAX_GROUP_SIZE, useGestionDuGroupe } from './useGestionDuGroupe';

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
  // TCK-2748 — la gestion est partagée avec la colonne « Infos du groupe » du bureau.
  const g = useGestionDuGroupe(conversation, onClose);
  const { participants, estAdmin: isAdmin, dernierAdmin: isLastAdmin, erreurs, setError } = g;
  const [subject, setSubject] = useState(conversation?.subject ?? '');

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
                  onClick={() => g.renommer(subject)}
                  disabled={g.enCours.renommer || subject === (conversation?.subject ?? '')}
                  aria-label={t('renameSave')}
                >
                  {g.enCours.renommer ? (
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
                  isSelf={p.user_id === g.moiId}
                  canManage={Boolean(isAdmin)}
                  onRemove={g.retirer}
                  onPromote={(id) => g.changerDeRole(id, 'admin')}
                  onDemote={(id) => g.changerDeRole(id, 'member')}
                  busy={g.enCours.retirer || g.enCours.role}
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
                {g.enCours.inviter ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : null}
              </label>
              <ParticipantPicker
                inputId="add-participant-input"
                conversationId={g.conversationId}
                value={[]}
                excludeIds={participants.map((p) => p.user_id)}
                max={Math.max(0, MAX_GROUP_SIZE - participants.length)}
                onMaxReached={() =>
                  setError(tCreation('maxParticipants', { max: MAX_GROUP_SIZE }))
                }
                onChange={(next) => g.inviter(next.at(-1))}
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
            disabled={g.enCours.sourdine}
            onClick={() => g.basculerLaSourdine(currentMute)}
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
            disabled={g.enCours.retirer || isLastAdmin}
            onClick={g.quitter}
          >
            <LogOut className="mr-2 size-4" aria-hidden />
            {t('leave')}
          </Button>
          {isLastAdmin && (
            <p className="text-[0.625rem] text-muted-foreground">{t('lastAdminLeaveHint')}</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
