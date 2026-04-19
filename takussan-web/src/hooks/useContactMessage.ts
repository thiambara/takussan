'use client';
import { useState } from 'react';
import { submitContactMessage } from '@/app/actions/property';

export function useContactMessage(slug: string) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(message: string): Promise<{ conversation_id: number; redirect_to: string }> {
    setSubmitting(true);
    setError(null);
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
