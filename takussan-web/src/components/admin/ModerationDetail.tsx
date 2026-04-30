'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Check, EyeOff, Trash2, X, Loader2, Flag } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import {
  fetchReviewReports,
  moderateReview,
  type ModerationReview,
  type ModerationDecision,
} from '@/lib/queries/reviews-moderation';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';

interface ModerationDetailProps {
  readonly review: ModerationReview;
  readonly onModerated: () => void;
}

type PendingDecision = { decision: ModerationDecision; requiresReason: boolean } | null;

export function ModerationDetail({ review, onModerated }: ModerationDetailProps) {
  const { token } = useAuth();
  const [pending, setPending] = useState<PendingDecision>(null);
  const [reason, setReason] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: reportsData } = useQuery({
    queryKey: ['reviews-moderation', 'reports', review.id],
    queryFn: () => fetchReviewReports(review.id, token ?? ''),
    enabled: Boolean(token) && review.reported_count > 0,
  });

  const mutation = useMutation({
    mutationFn: ({ decision, reason: r }: { decision: ModerationDecision; reason?: string }) =>
      moderateReview(review.id, { decision, reason: r }, token ?? ''),
    onSuccess: () => {
      setPending(null);
      setReason('');
      setErrorMessage(null);
      onModerated();
    },
    onError: (err) => {
      setErrorMessage(err instanceof ApiError ? err.displayMessage : 'Une erreur est survenue.');
    },
  });

  const handleDecision = (decision: ModerationDecision) => {
    setErrorMessage(null);
    if (decision === 'approve') {
      mutation.mutate({ decision });
      return;
    }
    setPending({ decision, requiresReason: true });
  };

  const confirmPending = () => {
    if (!pending) return;
    if (pending.requiresReason && reason.trim().length === 0) {
      setErrorMessage('Une raison est requise.');
      return;
    }
    mutation.mutate({ decision: pending.decision, reason: reason.trim() });
  };

  const cancelPending = () => {
    setPending(null);
    setReason('');
    setErrorMessage(null);
  };

  const reports = reportsData?.data ?? [];

  return (
    <section
      className="rounded-xl bg-app-surface-1 p-6"
      data-testid="moderation-detail"
    >
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-app-ink-muted">
            Avis #{review.id}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-app-ink">
            {review.title || 'Avis sans titre'}
          </h2>
          <p className="text-xs text-app-ink-muted">
            Par {review.author?.name ?? 'Anonyme'} — note {review.rating}/5
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => handleDecision('approve')}
            disabled={mutation.isPending}
          >
            <Check className="size-4" />
            Approuver
          </Button>
          <Button
            variant="outline"
            onClick={() => handleDecision('hide')}
            disabled={mutation.isPending}
          >
            <EyeOff className="size-4" />
            Masquer
          </Button>
          <Button
            variant="destructive"
            onClick={() => handleDecision('delete')}
            disabled={mutation.isPending}
          >
            <Trash2 className="size-4" />
            Supprimer
          </Button>
          {review.reported_count > 0 ? (
            <Button
              variant="ghost"
              onClick={() => handleDecision('ignore')}
              disabled={mutation.isPending}
            >
              <X className="size-4" />
              Ignorer les signalements
            </Button>
          ) : null}
        </div>
      </header>

      <div className="mt-5 whitespace-pre-wrap rounded-lg bg-app-surface-2/40 p-4 text-sm text-app-ink">
        {review.content ?? <em className="text-app-ink-muted">Aucun commentaire.</em>}
      </div>

      {reports.length > 0 ? (
        <div className="mt-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-app-ink">
            <Flag className="size-4 text-red-600" />
            Signalements ({reports.length})
          </h3>
          <ul className="space-y-2">
            {reports.map((report, i) => (
              <li
                key={`${report.user_id ?? 'anon'}-${i}`}
                className="rounded-lg border border-app-surface-2 bg-app-surface-2/20 p-3 text-sm"
              >
                <div className="flex items-center justify-between text-xs text-app-ink-muted">
                  <span>{report.user?.name ?? 'Utilisateur'}</span>
                  {report.reported_at ? (
                    <span>{new Date(report.reported_at).toLocaleString()}</span>
                  ) : null}
                </div>
                <p className="mt-1 text-app-ink">{report.reason ?? '—'}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {pending ? (
        <div
          className="mt-5 rounded-lg border border-app-surface-2 bg-app-surface-2/30 p-4"
          data-testid="moderation-confirm"
        >
          <p className="mb-2 text-sm font-semibold text-app-ink">
            {pending.decision === 'delete'
              ? 'Confirmer la suppression de cet avis ? Cette action est irréversible.'
              : pending.decision === 'hide'
                ? 'Masquer cet avis ?'
                : 'Ignorer les signalements ?'}
          </p>
          <label htmlFor="moderation-reason" className="text-xs text-app-ink-muted">
            Raison (consignée dans le journal d&apos;audit)
          </label>
          <textarea
            id="moderation-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            placeholder="Motif visible dans le journal d'audit"
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" onClick={cancelPending} disabled={mutation.isPending}>
              Annuler
            </Button>
            <Button
              variant={pending.decision === 'delete' ? 'destructive' : 'default'}
              onClick={confirmPending}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Confirmer
            </Button>
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}
