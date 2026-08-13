'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Frontière d'erreur du tableau de bord — et son absence coûtait cher.
 *
 * Les gardes d'accès Standard-only sont fail-closed : quand l'API ne répond pas, elles refusent.
 * C'est la bonne règle. Mais sans cet écran, le refus prenait la forme d'une redirection muette
 * vers `/app`, tous les accès pro cadenassés : pour un `agency_admin` d'une agence `standard`,
 * une panne de trente secondes était **indiscernable d'un déclassement de forfait**.
 *
 * ⚠ Cette frontière attrape TOUT ce qui remonte du segment `(dashboard)`. Son message est donc
 * GÉNÉRIQUE, et il doit le rester. Deux versions antérieures ont essayé d'y être spécifiques :
 * la première affirmait sans condition que les accès d'agence n'avaient pas pu être vérifiés —
 * un bug de rendu dans `/app/properties/[id]` donnait alors un diagnostic positivement faux ; la
 * seconde conditionnait le message à un marqueur dans `error.message`, inopérant en production
 * puisque Next y expurge les messages des Server Components.
 *
 * Le cas « vérification d'agence indisponible » a désormais sa propre ROUTE
 * (`/app/verification-indisponible`), atteinte par redirection. Une redirection ne dépend
 * d'aucune sérialisation.
 *
 * *Une frontière large qui affirme une cause étroite se trompe partout sauf à un endroit.*
 */
export default function DashboardError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  const t = useTranslations('errors.boundary');

  useEffect(() => {
    console.error('[dashboard] erreur non rattrapée', error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <AlertTriangle className="size-10 text-app-accent" aria-hidden />
      <h1 className="text-xl font-semibold text-app-ink">{t('title')}</h1>
      <p className="max-w-md text-sm text-app-ink-muted">{t('body')}</p>
      {error.digest && (
        <p className="text-xs text-app-ink-muted">{t('reference', { digest: error.digest })}</p>
      )}
      <Button onClick={reset}>{t('retry')}</Button>
    </div>
  );
}
