'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WizardDraft, WizardDraftResponse } from '@/types/wizard-draft';

/**
 * TCK-250 — Frontend hook for resumable wizard drafts.
 *
 * - On mount, fetches the user's current draft for `key` (404 → null).
 * - Exposes `save(step, data)` that PUTs to `/api/me/wizard-drafts/{key}`,
 *   debounced to coalesce rapid keystrokes (default 800ms — see ticket).
 * - Exposes `clear()` that DELETEs the draft (called on completion or
 *   explicit user abandon).
 *
 * The hook does NOT prescribe the shape of `data` — each consumer wizard
 * brings its own schema and validates it.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TCK-465 — le sort de l'écriture est RENDU à l'appelant
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `flush()` rendait `Promise<void>` et rangeait l'échec dans l'état `error` :
 * un appelant qui `await flush()` puis navigue ne pouvait pas distinguer
 * « c'est écrit » de « c'est perdu ». Le hook garde son état `error` — utile
 * pour un bandeau permanent — mais `flush()` rend désormais le RÉSULTAT de
 * l'écriture qu'il vient de provoquer.
 *
 * ⚠ Trois issues et non deux, et la troisième est celle qui fait mentir un
 * booléen : `flush()` peut n'avoir RIEN à envoyer (aucune frappe en attente).
 * Rendre `ok: true` dans ce cas serait affirmer un enregistrement sans preuve
 * — précisément l'inverse du défaut qu'on corrige. D'où {@link ecrit}, et d'où
 * {@link dernierEchecRef} : si la dernière sauvegarde débouncée a échoué et
 * qu'aucune réussite ne l'a remplacée depuis, un `flush()` sans rien à écrire
 * rend cet échec-là plutôt qu'un vert qu'il n'a pas mesuré.
 */
export type UseWizardDraftOptions = {
  /** Debounce window for autosave in ms. Default 800ms (per TCK-250 spec). */
  debounceMs?: number;
  /** Skip the initial GET (e.g. when the consumer already has the draft). */
  skipInitialFetch?: boolean;
};

/**
 * Le sort d'une écriture de brouillon, tel que l'appelant peut le lire.
 *
 * - `{ ok: true, ecrit: true }`  — un PUT est parti et le serveur l'a accepté.
 * - `{ ok: true, ecrit: false }` — il n'y avait rien à écrire, et rien d'échoué
 *   auparavant. Le brouillon connu du serveur est à jour ; personne n'a rien
 *   promis de plus.
 * - `{ ok: false, error }`       — l'écriture a échoué, ou la dernière écriture
 *   débouncée avait échoué sans qu'une réussite la remplace.
 */
export type ResultatEcritureBrouillon =
  | { ok: true; ecrit: boolean }
  | { ok: false; ecrit: boolean; error: Error };

export type UseWizardDraftResult<TData> = {
  /** True while the initial fetch is in flight. */
  isLoading: boolean;
  /** True while a save request is being sent. */
  isSaving: boolean;
  /** The most recent error from save/load, or null. */
  error: Error | null;
  /** The draft as last known by the server, or null if none yet. */
  draft: WizardDraft<TData> | null;
  /**
   * Schedule a save. Calls within `debounceMs` of each other coalesce into
   * a single PUT carrying the latest payload. Resolves when the actual
   * network request finishes (or immediately for the coalesced calls that
   * were superseded — they no-op and resolve undefined).
   */
  save: (step: number, data: TData) => void;
  /**
   * Force an immediate flush of any pending debounced save. Useful before
   * navigating away or unmounting. Resolves once the in-flight PUT settles,
   * **avec le sort de cette écriture** (TCK-465) — un appelant qui s'apprête à
   * quitter la page doit pouvoir ne PAS la quitter.
   */
  flush: () => Promise<ResultatEcritureBrouillon>;
  /** Delete the draft on the server and reset local state. */
  clear: () => Promise<void>;
};

type FetchResponse<T> = { ok: boolean; status: number; json: () => Promise<T> };

async function safeFetch<T>(url: string, init?: RequestInit): Promise<FetchResponse<T>> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    ...init,
  });
  return {
    ok: res.ok,
    status: res.status,
    json: () => res.json() as Promise<T>,
  };
}

export function useWizardDraft<TData = Record<string, unknown>>(
  key: string,
  options: UseWizardDraftOptions = {},
): UseWizardDraftResult<TData> {
  const { debounceMs = 800, skipInitialFetch = false } = options;

  const [isLoading, setIsLoading] = useState(!skipInitialFetch);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [draft, setDraft] = useState<WizardDraft<TData> | null>(null);

  // Holds the most recent payload requested while a debounce timer is alive.
  const pendingRef = useRef<{ step: number; data: TData } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Promise resolver for the current debounce window — `flush()` awaits it.
  const flushResolversRef = useRef<Array<() => void>>([]);
  /**
   * La dernière écriture ayant ÉCHOUÉ et qu'aucune réussite n'a remplacée
   * depuis (TCK-465). C'est ce qui permet à `flush()` sans rien en attente de
   * rendre un échec au lieu d'un vert qu'il n'a pas mesuré.
   */
  const dernierEchecRef = useRef<Error | null>(null);

  // TCK-316 — la remise à zéro « nouvelle clé, on recharge » se fait pendant le
  // RENDU, pas au début de l'effet. `setIsLoading(true)` y était de toute façon
  // redondant au montage (`useState(!skipInitialFetch)` l'a déjà posé) ; il ne
  // servait qu'au changement de `key`, et le payer par un rendu en cascade à
  // CHAQUE exécution de l'effet était le prix fort pour ce seul cas. L'écriture
  // converge : `fetchedKey` rattrape `key` et n'y revient pas.
  const [fetchedKey, setFetchedKey] = useState<string | null>(null);
  if (!skipInitialFetch && fetchedKey !== key) {
    setFetchedKey(key);
    setIsLoading(true);
    setError(null);
  }

  // Initial fetch — runs once per `key`.
  useEffect(() => {
    if (skipInitialFetch) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await safeFetch<WizardDraftResponse<TData>>(
          `/api/me/wizard-drafts/${encodeURIComponent(key)}`,
          { method: 'GET' },
        );
        if (cancelled) return;
        if (res.status === 404) {
          setDraft(null);
        } else if (!res.ok) {
          throw new Error(`GET wizard-drafts failed (${res.status})`);
        } else {
          const body = await res.json();
          setDraft(body.data);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key, skipInitialFetch]);

  const performSave = useCallback(
    async (payload: { step: number; data: TData }): Promise<ResultatEcritureBrouillon> => {
      setIsSaving(true);
      setError(null);
      try {
        const res = await safeFetch<WizardDraftResponse<TData>>(
          `/api/me/wizard-drafts/${encodeURIComponent(key)}`,
          { method: 'PUT', body: JSON.stringify(payload) },
        );
        if (!res.ok) throw new Error(`PUT wizard-drafts failed (${res.status})`);
        const body = await res.json();
        setDraft(body.data);
        dernierEchecRef.current = null;
        return { ok: true, ecrit: true };
      } catch (err) {
        const erreur = err instanceof Error ? err : new Error(String(err));
        setError(erreur);
        // ⚠ Un ref et non le seul état : `flush()` est appelé dans le même tour
        // que l'échec d'une sauvegarde débouncée, avant que React n'ait re-rendu.
        // Lire `error` là serait lire la valeur d'avant.
        dernierEchecRef.current = erreur;
        return { ok: false, ecrit: true, error: erreur };
      } finally {
        setIsSaving(false);
      }
    },
    [key],
  );

  const flush = useCallback(async (): Promise<ResultatEcritureBrouillon> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const payload = pendingRef.current;
    pendingRef.current = null;
    const resolvers = flushResolversRef.current;
    flushResolversRef.current = [];
    const resultat: ResultatEcritureBrouillon = payload
      ? await performSave(payload)
      : dernierEchecRef.current
        ? { ok: false, ecrit: false, error: dernierEchecRef.current }
        : { ok: true, ecrit: false };
    resolvers.forEach((r) => r());
    return resultat;
  }, [performSave]);

  const save = useCallback(
    (step: number, data: TData): void => {
      pendingRef.current = { step, data };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const payload = pendingRef.current;
        pendingRef.current = null;
        const resolvers = flushResolversRef.current;
        flushResolversRef.current = [];
        if (payload) {
          void performSave(payload).then(() => resolvers.forEach((r) => r()));
        } else {
          resolvers.forEach((r) => r());
        }
      }, debounceMs);
    },
    [debounceMs, performSave],
  );

  const clear = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
    // Le brouillon est en train de disparaître : un échec d'écriture antérieur
    // n'a plus rien à signaler. Le laisser ferait rendre `ok: false` au
    // `flush()` d'un parcours suivant, sur une donnée qui n'existe plus.
    dernierEchecRef.current = null;
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/me/wizard-drafts/${encodeURIComponent(key)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!res.ok && res.status !== 204) {
        throw new Error(`DELETE wizard-drafts failed (${res.status})`);
      }
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsSaving(false);
    }
  }, [key]);

  // Cleanup on unmount: cancel any pending debounce. We intentionally do NOT
  // auto-flush here — flushing should be an explicit consumer choice
  // (typically via `flush()` in a `beforeunload` handler).
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { isLoading, isSaving, error, draft, save, flush, clear };
}
