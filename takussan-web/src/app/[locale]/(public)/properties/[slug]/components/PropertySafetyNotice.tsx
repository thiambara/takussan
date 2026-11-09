'use client';
import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * TCK-598 (V8) — l'encadré de prudence, HORS de la carte de contact (qui appartient à TCK-590),
 * juste sous elle. Il informe sans effrayer : un ton neutre, une couleur de surface et non
 * d'alerte, une phrase et un conseil.
 */
export function PropertySafetyNotice({ className }: { readonly className?: string }) {
  const t = useTranslations('property.detail.trust');
  // TCK-2501 — rendu deux fois (fin de colonne en mobile, sous la carte de contact en bureau).
  const titreId = useId();

  return (
    <aside
      aria-labelledby={titreId}
      className={cn('flex gap-3 rounded-xl border border-border bg-muted p-4 text-sm', className)}
    >
      <Info className="mt-0.5 size-4 shrink-0 bg-muted text-muted-foreground" aria-hidden />
      <div className="space-y-1">
        <p id={titreId} className="font-medium text-foreground">
          {t('safetyTitle')}
        </p>
        <p className="bg-muted text-muted-foreground text-pretty">{t('safetyBody')}</p>
      </div>
    </aside>
  );
}
