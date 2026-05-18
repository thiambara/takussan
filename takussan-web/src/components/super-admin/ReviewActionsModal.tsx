'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';
import {
  approveAdminAgencyUpgradeRequest,
  rejectAdminAgencyUpgradeRequest,
  type AdminAgencyUpgradeRequestRow,
} from '@/lib/queries/super-admin';

/**
 * TCK-268 — Decision modal for the agency upgrade review console.
 *
 * Exposes both `approve` and `reject` flows behind one component so the
 * detail page can lift the open/close state without duplicating form
 * boilerplate. The `comment` field is optional in `approve` mode and
 * required (min 5 chars) in `reject` mode — the submit button stays
 * disabled until the constraint is met to avoid round-trips for an
 * inevitable 422.
 */
export type ReviewMode = 'approve' | 'reject';

const REJECT_MIN_CHARS = 5;

export interface ReviewActionsModalProps {
  readonly open: boolean;
  readonly mode: ReviewMode;
  readonly requestId: number;
  readonly onOpenChange: (open: boolean) => void;
  readonly onDecided?: (decision: ReviewMode, request: AdminAgencyUpgradeRequestRow) => void;
}

export function ReviewActionsModal({
  open,
  mode,
  requestId,
  onOpenChange,
  onDecided,
}: ReviewActionsModalProps) {
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  // Reset state via the parent's close handler — keeps render pure
  // (no setState inside an effect) and matches Radix Dialog conventions.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setComment('');
      setError(null);
    }
    onOpenChange(next);
  };

  const mutation = useMutation({
    mutationFn: () =>
      mode === 'approve'
        ? approveAdminAgencyUpgradeRequest(requestId, comment.trim() === '' ? null : comment.trim())
        : rejectAdminAgencyUpgradeRequest(requestId, comment.trim()),
    onSuccess: (decision) => {
      toast.add({
        title: mode === 'approve' ? 'Demande approuvée' : 'Demande rejetée',
        description:
          mode === 'approve'
            ? "L'agence sera notifiée de la décision."
            : 'Le motif a été transmis au demandeur.',
        type: 'success',
      });
      onDecided?.(mode, decision);
      handleOpenChange(false);
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        setError(e.displayMessage);
      } else {
        setError('Une erreur est survenue. Réessayez.');
      }
    },
  });

  const trimmedLength = comment.trim().length;
  const submitDisabled =
    mutation.isPending ||
    (mode === 'reject' && trimmedLength < REJECT_MIN_CHARS);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (mode === 'reject' && trimmedLength < REJECT_MIN_CHARS) {
      // Defensive — the disabled button should already prevent this.
      setError(`Le motif doit faire au moins ${REJECT_MIN_CHARS} caractères.`);
      return;
    }
    mutation.mutate();
  }

  const isApprove = mode === 'approve';
  const Icon = isApprove ? CheckCircle2 : XCircle;
  const accent = isApprove ? 'text-emerald-600' : 'text-red-600';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`size-5 ${accent}`} aria-hidden="true" />
            <span>{isApprove ? 'Approuver la demande' : 'Rejeter la demande'}</span>
          </DialogTitle>
          <DialogDescription>
            {isApprove
              ? "L'agence passera en mode professionnel. Cette action est définitive."
              : 'Le demandeur recevra le motif par email et pourra soumettre une nouvelle demande.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="review-comment">
              {isApprove ? 'Commentaire (optionnel)' : 'Motif du rejet'}
              {isApprove ? null : <span className="ml-1 text-red-600">*</span>}
            </Label>
            <Textarea
              id="review-comment"
              required={!isApprove}
              minLength={isApprove ? undefined : REJECT_MIN_CHARS}
              maxLength={2000}
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                isApprove
                  ? 'Ex. Statuts vérifiés, RIB cohérent.'
                  : 'Ex. Statuts juridiques illisibles — merci de transmettre une version PDF non-scannée.'
              }
            />
            {!isApprove ? (
              <p className="text-xs text-stone-500">
                {trimmedLength} / 2000 caractères{' '}
                {trimmedLength < REJECT_MIN_CHARS ? `(minimum ${REJECT_MIN_CHARS})` : null}
              </p>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={submitDisabled}
              variant={isApprove ? 'default' : 'destructive'}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  <span>Envoi…</span>
                </>
              ) : (
                <span>{isApprove ? 'Confirmer l’approbation' : 'Confirmer le rejet'}</span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
