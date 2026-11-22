'use client';
import { useState } from 'react';
import { submitVisitRequest } from '@/app/actions/property';
import type { VisitRequestPayload } from '@/types/visit';

/**
 * L'échec d'une demande de visite. TCK-2503 — un 422 porte les erreurs PAR CHAMP
 * (`errors.<champ>` de Laravel) : la boîte les pose sur le bon champ, et sur la bonne étape.
 */
export class DemandeDeVisiteRefusee extends Error {
  constructor(
    message: string,
    readonly errors: Readonly<Record<string, string[]>>,
  ) {
    super(message);
  }
}

export function useVisitRequest(slug: string) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(payload: VisitRequestPayload): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitVisitRequest(slug, payload);
      if (!res.ok) {
        setError(res.message);
        throw new DemandeDeVisiteRefusee(res.message, res.errors ?? {});
      }
    } finally {
      setSubmitting(false);
    }
  }

  return { submit, submitting, error };
}
