'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { REVIEW_REPLY_MAX } from '@/lib/review-limits';

interface PropertyReviewReplyFormProps {
  reviewId: number;
  initialContent?: string | null;
  onSubmit: (reviewId: number, replyContent: string) => Promise<void>;
  onCancel?: () => void;
}

/**
 * Inline form for agent/owner to post or edit a public reply to a review.
 *
 * Backend surface: `POST /api/reviews/{id}/reply` performs an upsert, so the
 * same form is reused for initial post and edit. Its thresholds are the API's (TCK-2089): a
 * non-empty reply, `REVIEW_REPLY_MAX` characters at most — the same as « Mes avis ».
 */
export function PropertyReviewReplyForm({
  reviewId,
  initialContent,
  onSubmit,
  onCancel,
}: PropertyReviewReplyFormProps) {
  const t = useTranslations('property.reviews.replyForm');
  const tForm = useTranslations('property.reviews.form');
  const messageErreur = useMessageErreurApi();
  const [content, setContent] = useState(initialContent ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const trimmed = content.trim();
  const empty = trimmed.length === 0;

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (empty) {
      setError(t('contentRequired'));
      return;
    }
    setError(null);
    setPending(true);
    try {
      await onSubmit(reviewId, trimmed);
    } catch (err) {
      setError(messageErreur(err, tForm('sendError')));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 ml-2 pl-3 border-l-2 border-border space-y-2"
      aria-label={t(initialContent ? 'editTitle' : 'newTitle')}
    >
      <p className="text-xs font-medium text-muted-foreground">
        {t(initialContent ? 'editSubmit' : 'newSubmit')}
      </p>
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        maxLength={REVIEW_REPLY_MAX}
        placeholder={t('placeholder')}
        aria-label={t('contentAria')}
      />
      <div className="flex justify-between items-center gap-2 text-xs text-muted-foreground">
        <span>
          {trimmed.length}/{REVIEW_REPLY_MAX}
        </span>
        {error && (
          <span role="alert" className="text-destructive">
            {error}
          </span>
        )}
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            {t('cancel')}
          </Button>
        )}
        <Button type="submit" disabled={pending || empty}>
          {pending ? t('sending') : initialContent ? t('save') : t('publish')}
        </Button>
      </div>
    </form>
  );
}
