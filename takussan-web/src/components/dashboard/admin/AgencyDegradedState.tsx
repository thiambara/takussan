import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * État dégradé affiché lorsque `/api/dashboard/agency` répond 403/404 :
 * permissions insuffisantes ou contexte d'agence introuvable. Les KPIs
 * sont délibérément masqués (pas de zéros trompeurs).
 */
export function AgencyDegradedState() {
  const t = useTranslations('dashboard.agencyDegraded');

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-card p-12 text-center">
      <Lock className="size-10 text-muted-foreground" />
      <p className="text-sm font-semibold text-foreground">{t('title')}</p>
      <p className="max-w-md text-xs text-muted-foreground">{t('body')}</p>
    </div>
  );
}
