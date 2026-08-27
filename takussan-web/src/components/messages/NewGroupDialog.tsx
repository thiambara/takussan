'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  useCreateGroupConversation,
  type CreateGroupConversationPayload,
} from '@/lib/queries/conversations';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

interface NewGroupDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreated?: (conversationId: number) => void;
  readonly defaultPropertyId?: number;
  readonly defaultLeaseId?: number;
}

const MIN_PARTICIPANTS = 2; // creator + 2 others = 3 total
const MAX_PARTICIPANTS = 19; // creator + 19 = 20 total

/**
 * TCK-085 — Create a group conversation. 2-step wizard:
 *   1. enter participant user IDs (comma-separated for V1 — autocomplete is
 *      a follow-up; backend scope check enforces the rules at submit time).
 *   2. enter subject + optional context (property/lease).
 */
export function NewGroupDialog({
  open,
  onClose,
  onCreated,
  defaultPropertyId,
  defaultLeaseId,
}: NewGroupDialogProps) {
  const t = useTranslations('messaging.group.create');
  const messageErreur = useMessageErreurApi();
  const create = useCreateGroupConversation();
  const [step, setStep] = useState<1 | 2>(1);
  const [participants, setParticipants] = useState<number[]>([]);
  const [participantInput, setParticipantInput] = useState('');
  const [subject, setSubject] = useState('');
  const [propertyId, setPropertyId] = useState<string>(
    defaultPropertyId ? String(defaultPropertyId) : '',
  );
  const [leaseId, setLeaseId] = useState<string>(
    defaultLeaseId ? String(defaultLeaseId) : '',
  );
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep(1);
    setParticipants([]);
    setParticipantInput('');
    setSubject('');
    setPropertyId(defaultPropertyId ? String(defaultPropertyId) : '');
    setLeaseId(defaultLeaseId ? String(defaultLeaseId) : '');
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function addParticipant() {
    setError(null);
    const raw = participantInput.trim();
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
      setError(t('invalidId'));
      return;
    }
    if (participants.includes(id)) {
      setError(t('duplicate'));
      return;
    }
    if (participants.length >= MAX_PARTICIPANTS) {
      setError(t('maxParticipants', { max: MAX_PARTICIPANTS + 1 }));
      return;
    }
    setParticipants([...participants, id]);
    setParticipantInput('');
  }

  function removeParticipant(id: number) {
    setParticipants(participants.filter((p) => p !== id));
  }

  function nextStep() {
    setError(null);
    if (participants.length < MIN_PARTICIPANTS) {
      setError(t('minParticipants', { min: MIN_PARTICIPANTS + 1 }));
      return;
    }
    setStep(2);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (subject.trim().length === 0) {
      setError(t('subjectRequired'));
      return;
    }
    const payload: CreateGroupConversationPayload = {
      type: 'group',
      subject: subject.trim(),
      participants,
    };
    if (propertyId) payload.property_id = Number(propertyId);
    if (leaseId) payload.lease_id = Number(leaseId);
    try {
      const res = await create.mutateAsync(payload);
      onCreated?.(res.data.id);
      handleClose();
    } catch (err) {
      const msg = messageErreur(err, t('createFailed'));
      setError(msg);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : handleClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {step === 1 ? t('step1Description') : t('step2Description')}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground" htmlFor="participant-input">{t('participantsLabel')}</label>
              <div className="mt-1 flex gap-2">
                <Input
                  id="participant-input"
                  type="number"
                  inputMode="numeric"
                  placeholder={t('participantInputPlaceholder')}
                  value={participantInput}
                  onChange={(e) => setParticipantInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addParticipant();
                    }
                  }}
                />
                <Button type="button" onClick={addParticipant} variant="secondary">
                  {t('add')}
                </Button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t('participantsHint')}</p>
            </div>

            {participants.length > 0 && (
              <div className="flex flex-wrap gap-1.5" data-testid="participant-chips">
                {participants.map((id) => (
                  <Badge
                    key={id}
                    variant="secondary"
                    className="flex items-center gap-1"
                  >
                    #{id}
                    <button
                      type="button"
                      aria-label={t('removeParticipant', { id })}
                      onClick={() => removeParticipant(id)}
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={handleClose}>
                {t('cancel')}
              </Button>
              <Button type="button" onClick={nextStep}>
                {t('next')}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-muted-foreground" htmlFor="group-subject">{t('subjectLabel')}</label>
              <Input
                id="group-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={120}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-muted-foreground" htmlFor="group-property">{t('propertyLabel')}</label>
                <Input
                  id="group-property"
                  type="number"
                  placeholder="—"
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-muted-foreground" htmlFor="group-lease">{t('leaseLabel')}</label>
                <Input
                  id="group-lease"
                  type="number"
                  placeholder="—"
                  value={leaseId}
                  onChange={(e) => setLeaseId(e.target.value)}
                />
              </div>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                {t('back')}
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {t('create')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
