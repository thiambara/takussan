'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSubmitVisitFeedback } from '@/lib/queries/visits';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

interface Props {
  visitId: number;
  role: 'customer' | 'agent';
  onSubmitted?: () => void;
}

/**
 * TCK-075 — Minimal 2-field feedback form (rating 1–5 + comment).
 *
 * The backend gates submission by role ({@see PropertyVisitController::feedback}).
 * `customer` renders for the visitor, `agent` for the managing agent — both
 * can co-exist on the same visit.
 */
export function VisitFeedbackForm({ visitId, role, onSubmitted }: Props) {
  const t = useTranslations('visits.feedbackForm');
  const messageErreur = useMessageErreurApi();
  const mutation = useSubmitVisitFeedback(visitId);
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    try {
      await mutation.mutateAsync({
        role,
        rating,
        comment: comment || undefined,
      });
      setSuccess(true);
      onSubmitted?.();
    } catch (err) {
      const message = messageErreur(err, t('error'));
      setError(message);
    }
  }

  if (success) {
    return (
      <p className="text-sm text-success">
        {t('success', { role: role === 'customer' ? t('roleVisitor') : t('roleAgent') })}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm font-medium text-foreground">
        {role === 'customer' ? t('titleCustomer') : t('titleAgent')}
      </p>
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">{t('ratingLabel')}</span>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              className={`size-8 rounded-full border text-sm font-semibold ${
                n <= rating
                  ? 'border-warning/30 bg-warning/15 text-warning'
                  : 'border-border bg-card text-muted-foreground'
              }`}
              aria-label={t('starsAria', { count: String(n) })}
            >
              {n}
            </button>
          ))}
        </div>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">{t('commentLabel')}</span>
        <Textarea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={
            role === 'customer' ? t('placeholderCustomer') : t('placeholderAgent')
          }
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
