'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type { CustomerPipelineStage } from '@/types/customer';
import type { PipelineCustomerCard } from '@/types/pipeline';

interface ReasonDialogProps {
  pending: {
    customerId: number;
    from: CustomerPipelineStage;
    to: CustomerPipelineStage;
    card: PipelineCustomerCard;
  } | null;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}

/**
 * TCK-083 — captured every time a card is moved to a terminal stage
 * (`converted` / `lost`). The reason is forwarded to the backend, which
 * persists it as a pinned `CustomerNote`.
 *
 * The internal `<ReasonForm>` is rendered with a `key={customerId}` so
 * every new prompt remounts the form (and resets `reason`) without
 * needing a `setState`-in-effect dance.
 */
export function ReasonDialog({ pending, onCancel, onSubmit }: ReasonDialogProps) {
  const isOpen = pending !== null;
  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? null : onCancel())}>
      <DialogContent>
        {pending ? (
          <ReasonForm
            key={pending.customerId}
            pending={pending}
            onCancel={onCancel}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface ReasonFormProps {
  pending: NonNullable<ReasonDialogProps['pending']>;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}

function ReasonForm({ pending, onCancel, onSubmit }: ReasonFormProps) {
  const t = useTranslations('crm.pipeline');
  const [reason, setReason] = useState('');
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {t('reasonDialog.title', { stage: t(`stage.${pending.to}`) })}
        </DialogTitle>
        <DialogDescription>
          {t(
            pending.to === 'converted'
              ? 'reasonDialog.descriptionConverted'
              : 'reasonDialog.descriptionLost',
          )}
        </DialogDescription>
      </DialogHeader>
      <div className="py-2">
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder={t('reasonDialog.placeholder')}
          data-testid="reason-input"
        />
      </div>
      <DialogFooter>
        <Button variant="outline" type="button" onClick={onCancel}>
          {t('actions.cancel')}
        </Button>
        <Button
          type="button"
          disabled={reason.trim().length === 0}
          onClick={() => onSubmit(reason.trim())}
          data-testid="reason-submit"
        >
          {t('actions.confirm')}
        </Button>
      </DialogFooter>
    </>
  );
}
