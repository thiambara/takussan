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
    card?: PipelineCustomerCard;
  } | null;
  onCancel: () => void;
  /**
   * P244.01 (TCK-2361) — le parent ferme le dialogue (`pending` à `null`) sur le SUCCÈS, jamais
   * dans le même geste que l'envoi : un refus laisse le motif saisi en place.
   */
  onSubmit: (reason: string) => void;
  /** Le refus de l'API, dit dans le dialogue, à côté du motif gardé. */
  erreur?: string | null;
  /** L'envoi est en vol : le bouton de confirmation attend. */
  enCours?: boolean;
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
export function ReasonDialog({ pending, onCancel, onSubmit, erreur = null, enCours = false }: ReasonDialogProps) {
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
            erreur={erreur}
            enCours={enCours}
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
  erreur: string | null;
  enCours: boolean;
}

function ReasonForm({ pending, onCancel, onSubmit, erreur, enCours }: ReasonFormProps) {
  const t = useTranslations('crm.pipeline');
  const [reason, setReason] = useState('');
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {t('reasonDialog.title', { stage: t(`stage.${pending.to}`) })}
        </DialogTitle>
        <DialogDescription>
          {/* TCK-2371 — aucune garde du dépôt ne confronte les clés du code au dictionnaire : ces
              deux-là, absentes des trois langues, ne se voyaient qu'à l'écran. Leur garde est
              `ReasonDialog.description.tck-2371.test.tsx`. */}
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
          // P244.01 (TCK-2361) — la borne de `UpdatePipelineStageCustomerRequest` (`max:5000`).
          maxLength={5000}
          placeholder={t('reasonDialog.placeholder')}
          data-testid="reason-input"
        />
        {erreur ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {erreur}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button variant="outline" type="button" onClick={onCancel}>
          {t('actions.cancel')}
        </Button>
        <Button
          type="button"
          disabled={reason.trim().length === 0 || enCours}
          onClick={() => onSubmit(reason.trim())}
          data-testid="reason-submit"
        >
          {t('actions.confirm')}
        </Button>
      </DialogFooter>
    </>
  );
}
