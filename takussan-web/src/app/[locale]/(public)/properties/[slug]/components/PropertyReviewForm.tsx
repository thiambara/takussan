'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { REVIEW_CONTENT_MAX } from '@/lib/review-limits';

interface PropertyReviewFormProps {
  onSubmit: (payload: { rating: number; title?: string; content?: string }) => Promise<void>;
  submitting?: boolean;
}

export function PropertyReviewForm({ onSubmit, submitting }: PropertyReviewFormProps) {
  const t = useTranslations('property.reviews.form');
  // TCK-2089 : le commentaire est facultatif, comme à l'API et dans « Mes avis » ; même libellé.
  const tProfile = useTranslations('profile.reviews');
  const messageErreur = useMessageErreurApi();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const contentTrimmed = content.trim();
  const contentLength = contentTrimmed.length;

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (rating < 1) {
      setError(t('ratingRequired'));
      return;
    }
    setError(null);
    setPending(true);
    try {
      await onSubmit({
        rating,
        title: title.trim() || undefined,
        content: contentTrimmed || undefined,
      });
      setRating(0);
      setTitle('');
      setContent('');
    } catch (err) {
      setError(messageErreur(err, t('sendError')));
    } finally {
      setPending(false);
    }
  }

  const disabled = Boolean(submitting) || pending || rating < 1;

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border bg-card p-4 space-y-3"
      aria-label={t('aria')}
    >
      <p className="font-medium text-foreground">{t('title')}</p>
      <div
        role="radiogroup"
        aria-label={t('ratingAria')}
        className="flex items-center gap-1"
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const active = (hover || rating) >= n;
          return (
            <button
              type="button"
              key={n}
              role="radio"
              aria-checked={rating === n}
              aria-label={t('starsAria', { count: n })}
              onMouseEnter={() => setHover(n)}
              onClick={() => setRating(n)}
              className="p-0.5"
            >
              <Star
                className={`size-6 ${active ? 'fill-primary text-primary' : 'text-muted-foreground/40'}`}
              />
            </button>
          );
        })}
      </div>
      <Input
        type="text"
        placeholder={t('titlePlaceholder')}
        aria-label={t('titlePlaceholder')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
      />
      <div className="space-y-1">
        <Textarea
          placeholder={tProfile('opportunityCommentLabel')}
          aria-label={tProfile('opportunityCommentLabel')}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          maxLength={REVIEW_CONTENT_MAX}
          aria-describedby="review-content-hint"
        />
        <p
          id="review-content-hint"
          className="text-xs text-muted-foreground flex justify-between"
        >
          <span>{contentLength > 0 ? t('thanks') : null}</span>
          <span>
            {contentLength}/{REVIEW_CONTENT_MAX}
          </span>
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={disabled}>
          {submitting || pending ? 'Envoi…' : 'Publier'}
        </Button>
      </div>
    </form>
  );
}
