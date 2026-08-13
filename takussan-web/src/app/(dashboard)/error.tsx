'use client';

import { AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Frontière d'erreur du tableau de bord — et son absence coûtait cher.
 *
 * Les gardes d'accès Standard-only sont fail-closed : quand l'API ne répond pas, elles refusent.
 * C'est la bonne règle. Mais sans cet écran, le refus prenait la forme d'une redirection muette
 * vers `/app`, tous les accès pro cadenassés : pour un `agency_admin` d'une agence `standard`,
 * une panne de trente secondes était **indiscernable d'un déclassement de forfait**. Il n'y avait
 * aucun `error.tsx` dans toute l'application — rien ne pouvait dire la différence.
 *
 * `resolveAgencyOrNull(..., 'decision')` relance donc les pannes transitoires (429, 5xx, réseau)
 * au lieu de les avaler, et elles atterrissent ici. Les vraies réponses de l'API — 401, 403,
 * 404 — continuent de refuser en silence : elles, elles disent quelque chose.
 *
 * *Fail-closed décide de l'accès ; il ne décide pas de ce qu'on a le droit de comprendre.*
 */
export default function DashboardError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    console.error('[dashboard] erreur non rattrapée', error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertTriangle className="size-10 text-app-accent" aria-hidden />
      <h1 className="text-xl font-semibold text-app-ink">Cette page n’a pas pu être vérifiée</h1>
      <p className="max-w-md text-sm text-app-ink-muted">
        Nous n’avons pas réussi à joindre le serveur pour confirmer les accès de votre agence.
        Ce n’est pas un changement de votre formule — réessayez dans un instant.
      </p>
      {error.digest && (
        <p className="text-xs text-app-ink-muted">Référence technique : {error.digest}</p>
      )}
      <Button onClick={reset}>Réessayer</Button>
    </div>
  );
}
