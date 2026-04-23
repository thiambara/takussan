'use client';
import { useState } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface PropertyReviewFormProps {
  onSubmit: (payload: { rating: number; title?: string; content?: string }) => Promise<void>;
  submitting?: boolean;
}

export const REVIEW_CONTENT_MIN = 10;
export const REVIEW_CONTENT_MAX = 2000;

export function PropertyReviewForm({ onSubmit, submitting }: PropertyReviewFormProps) {
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
      setError('Merci de choisir une note.');
      return;
    }
    if (contentLength < REVIEW_CONTENT_MIN) {
      setError(`Votre commentaire doit contenir au moins ${REVIEW_CONTENT_MIN} caractères.`);
      return;
    }
    setError(null);
    setPending(true);
    try {
      await onSubmit({
        rating,
        title: title.trim() || undefined,
        content: contentTrimmed,
      });
      setRating(0);
      setTitle('');
      setContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l’envoi.');
    } finally {
      setPending(false);
    }
  }

  const disabled = Boolean(submitting) || pending || rating < 1 || contentLength < REVIEW_CONTENT_MIN;

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-stone-200 bg-white p-4 space-y-3"
      aria-label="Laisser un avis"
    >
      <p className="font-medium text-stone-900">Laisser un avis</p>
      <div
        role="radiogroup"
        aria-label="Note sur 5"
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
              aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
              onMouseEnter={() => setHover(n)}
              onClick={() => setRating(n)}
              className="p-0.5"
            >
              <Star
                className={`size-6 ${active ? 'fill-amber-400 text-amber-400' : 'text-stone-300'}`}
              />
            </button>
          );
        })}
      </div>
      <Input
        type="text"
        placeholder="Titre (optionnel)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
      />
      <div className="space-y-1">
        <Textarea
          placeholder={`Votre avis (min. ${REVIEW_CONTENT_MIN} caractères)`}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          maxLength={REVIEW_CONTENT_MAX}
          aria-describedby="review-content-hint"
        />
        <p
          id="review-content-hint"
          className="text-xs text-stone-500 flex justify-between"
        >
          <span>
            {contentLength < REVIEW_CONTENT_MIN
              ? `Encore ${REVIEW_CONTENT_MIN - contentLength} caractère${
                  REVIEW_CONTENT_MIN - contentLength > 1 ? 's' : ''
                } minimum.`
              : 'Merci pour votre retour.'}
          </span>
          <span>
            {contentLength}/{REVIEW_CONTENT_MAX}
          </span>
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
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
