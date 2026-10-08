'use client';
import { useTranslations } from 'next-intl';
import { Info } from 'lucide-react';

/**
 * TCK-598 (V8) — l'encadré de prudence, HORS de la carte de contact (qui appartient à TCK-590),
 * juste sous elle. Il informe sans effrayer : un ton neutre, une couleur de surface et non
 * d'alerte, une phrase et un conseil.
 */
export function PropertySafetyNotice() {
  const t = useTranslations('property.detail.trust');

  return (
    <aside
      aria-labelledby="conseil-de-prudence"
      className="flex gap-3 rounded-xl border border-border bg-muted p-4 text-sm"
    >
      <Info className="mt-0.5 size-4 shrink-0 bg-muted text-muted-foreground" aria-hidden />
      <div className="space-y-1">
        <p id="conseil-de-prudence" className="font-medium text-foreground">
          {t('safetyTitle')}
        </p>
        <p className="bg-muted text-muted-foreground text-pretty">{t('safetyBody')}</p>
      </div>
    </aside>
  );
}
