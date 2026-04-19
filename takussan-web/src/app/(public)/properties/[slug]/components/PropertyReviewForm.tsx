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

export function PropertyReviewForm({ onSubmit, submitting }: PropertyReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (rating < 1) {
      setError('Merci de choisir une note.');
      return;
    }
    setError(null);
    try {
      await onSubmit({
        rating,
        title: title.trim() || undefined,
        content: content.trim() || undefined,
      });
      setRating(0);
      setTitle('');
      setContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l’envoi.');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
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
      <Textarea
        placeholder="Votre avis (optionnel)"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        maxLength={2000}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={submitting || rating < 1}>
          {submitting ? 'Envoi…' : 'Publier'}
        </Button>
      </div>
    </form>
  );
}
