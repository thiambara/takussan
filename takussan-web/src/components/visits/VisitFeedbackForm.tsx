'use client';

import { useState } from 'react';
import { useSubmitVisitFeedback } from '@/lib/queries/visits';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

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
      const message = err instanceof Error ? err.message : 'Erreur lors de l’envoi du feedback.';
      setError(message);
    }
  }

  if (success) {
    return (
      <p className="text-sm text-emerald-600">
        Merci ! Votre retour {role === 'customer' ? 'visiteur' : 'agent'} a bien été enregistré.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm font-medium text-stone-900">
        {role === 'customer' ? 'Votre retour visiteur' : 'Retour agent'}
      </p>
      <label className="block space-y-1 text-sm">
        <span className="text-stone-700">Note (1 à 5)</span>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              className={`size-8 rounded-full border text-sm font-semibold ${
                n <= rating
                  ? 'border-amber-500 bg-amber-100 text-amber-700'
                  : 'border-stone-200 bg-white text-stone-500'
              }`}
              aria-label={`${n} étoiles`}
            >
              {n}
            </button>
          ))}
        </div>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-stone-700">Commentaire (optionnel)</span>
        <Textarea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={
            role === 'customer'
              ? 'Ce que vous avez pensé du bien…'
              : 'Retour sur le déroulement de la visite…'
          }
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Envoi…' : 'Envoyer le feedback'}
      </Button>
    </form>
  );
}
