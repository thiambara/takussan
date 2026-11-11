'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  SAVED_SEARCH_FREQUENCIES,
  useUpdateSavedSearchMutation,
  type SavedSearch,
  type SavedSearchNotificationFrequency,
} from '@/lib/queries/saved-searches';

/**
 * TCK-599 — le réglage de l'alerte d'une recherche sauvegardée.
 *
 * TCK-2618 — sorti de `SavedSearchesList` pour l'onglet « Recherches » de la page des favoris, que
 * `/app/saved-searches` rend désormais. `canaux={false}` : la ligne qui le porte nomme déjà les canaux.
 *
 * Le réglage de l'alerte d'une ligne. La valeur affichée est celle de l'API, pas un état
 * local : un `PATCH` refusé ne laisse pas l'écran dire une fréquence que le serveur n'a pas.
 */
export function ReglageDAlerte({ search, canaux = true }: { readonly search: SavedSearch; readonly canaux?: boolean }) {
  const t = useTranslations('search.saved');
  const tChannels = useTranslations('search.alertChannels');
  const update = useUpdateSavedSearchMutation();
  const [error, setError] = useState(false);
  const current: SavedSearchNotificationFrequency = search.notification_frequency ?? 'daily';
  const channels = search.alert_channels ?? [];

  async function choose(next: SavedSearchNotificationFrequency) {
    if (next === current) return;
    setError(false);
    try {
      await update.mutateAsync({ id: search.id, notification_frequency: next });
    } catch {
      setError(true);
    }
  }

  return (
    <div className="mt-3 space-y-1.5">
      <div role="group" aria-label={t('alertAria', { name: search.name })} className="inline-flex rounded-full border border-border p-0.5">
        {SAVED_SEARCH_FREQUENCIES.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={current === f}
            disabled={update.isPending}
            onClick={() => void choose(f)}
            className={`min-h-9 rounded-full px-3 text-xs font-semibold transition disabled:cursor-wait ${
              current === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t(`frequency.${f}`)}
          </button>
        ))}
      </div>
      {canaux ? (
        <p className="text-xs text-muted-foreground" data-testid="alert-channels">
          {current === 'off' || channels.length === 0
            ? t('alertOff')
            : t('alertChannels', { channels: channels.map((c) => tChannels(c)).join(', ') })}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {t('alertError')}
        </p>
      ) : null}
    </div>
  );
}
