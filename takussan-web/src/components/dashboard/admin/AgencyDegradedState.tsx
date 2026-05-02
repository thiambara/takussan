import { Lock } from 'lucide-react';

/**
 * État dégradé affiché lorsque `/api/dashboard/agency` répond 403/404 :
 * permissions insuffisantes ou contexte d'agence introuvable. Les KPIs
 * sont délibérément masqués (pas de zéros trompeurs).
 */
export function AgencyDegradedState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-app-surface-1 p-12 text-center">
      <Lock className="size-10 text-app-ink-muted" />
      <p className="text-sm font-semibold text-app-ink">Indicateurs masqués</p>
      <p className="max-w-md text-xs text-app-ink-muted">
        Vous n&apos;avez pas la permission de consulter les rapports de cette agence. Contactez
        un administrateur si vous pensez qu&apos;il s&apos;agit d&apos;une erreur.
      </p>
    </div>
  );
}
