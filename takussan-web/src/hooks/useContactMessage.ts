'use client';
import { useState } from 'react';
import { submitContactMessage } from '@/app/actions/property';
import { useTriggerMinimalProfileOnce } from '@/hooks/useTriggerMinimalProfileOnce';

export function useContactMessage(slug: string) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // TCK-253 — Contacting an agent counts as a sensitive action — same
  // deferred-profile prompt as favorite/booking. No-op outside the
  // customer dashboard (provider absent).
  const { triggerIfNeeded } = useTriggerMinimalProfileOnce();

  async function submit(message: string): Promise<{ conversation_id: number; redirect_to: string }> {
    setSubmitting(true);
    setError(null);
    triggerIfNeeded();
    try {
      const res = await submitContactMessage(slug, message);
      if (!res.ok || !res.data) {
        const msg = !res.ok ? res.message : 'Réponse invalide.';
        setError(msg);
        throw new Error(msg);
      }
      return res.data;
    } finally {
      setSubmitting(false);
    }
  }

  return { submit, submitting, error };
}
