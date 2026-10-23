'use client';

import { useRef, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import type { WelcomeSlide } from '@/components/welcome/WelcomeModal';
import { useAccueilsVus } from '@/hooks/useAccueilsVus';

/**
 * TCK-251 — Drives a one-shot welcome modale.
 *
 * Behaviour:
 * - Skips entirely if the user is anonymous (per spec — strictly
 *   user-scoped tracking).
 * - On mount, reads the seen keys (`GET /api/me/welcome-seen`, shared through
 *   `useAccueilsVus`, TCK-1766). If `key` is missing from the list, opens the modale.
 * - On skip OR completion, POSTs `{ key }` to `/api/me/welcome-seen`
 *   (idempotent on the server) and closes locally. The POST is
 *   fire-and-forget for the UI: the modale closes immediately so the
 *   user is never blocked by a slow network.
 *
 * The returned shape is meant to spread directly into `<WelcomeModal>`.
 */
export type UseWelcomeOnceResult = {
  open: boolean;
  slides: WelcomeSlide[];
  onComplete: () => void;
  onSkip: () => void;
  /**
   * TCK-1477 — la fenêtre est réglée : jugée déjà vue, lecture en échec, ou fermée. Une file de
   * fenêtres (`AppShell`) attend ce signal pour ouvrir la suivante, jamais deux à la fois.
   */
  settled: boolean;
};

export function useWelcomeOnce(key: string, slides: WelcomeSlide[]): UseWelcomeOnceResult {
  const { user } = useAuth();
  const isAuthenticated = user !== null;

  // TCK-1766 (P136.03) — les clés vues viennent de la lecture partagée de la coque.
  const { vus, echec, marquerVu } = useAccueilsVus(isAuthenticated && !!key);
  // La clé que l'utilisateur a fermée pendant ce montage : la fenêtre reste fermée même si
  // l'écriture échoue.
  const [fermee, setFermee] = useState<string | null>(null);
  // Guard so we never POST twice for the same modale lifecycle (the
  // server is idempotent, but the network call is wasted).
  const acknowledgedRef = useRef<string | null>(null);

  // TCK-1477 — la lecture des clés vues a rendu son verdict (ou échoué).
  const checked = vus !== null || echec;
  const open = isAuthenticated && !!key && vus !== null && !vus.includes(key) && fermee !== key;

  const acknowledge = () => {
    if (acknowledgedRef.current === key || !key || !isAuthenticated) return;
    acknowledgedRef.current = key;
    marquerVu(key);
  };

  const onComplete = () => {
    acknowledge();
    setFermee(key);
  };

  const onSkip = () => {
    acknowledge();
    setFermee(key);
  };

  const settled = !isAuthenticated || !key || (checked && !open);

  return { open, slides, onComplete, onSkip, settled };
}
