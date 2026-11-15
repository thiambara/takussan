'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';

import { etapesFaites } from '@/lib/maintenance/signalement';
import { cn } from '@/lib/utils';
import type { MaintenanceStatus } from '@/types/maintenance';

const ETAPES = ['recue', 'artisan', 'visite', 'confirmez'] as const;

interface EtapesDeLaDemandeProps {
  readonly statut: MaintenanceStatus;
  readonly className?: string;
}

/**
 * TCK-2654 — les quatre étapes d'une demande, vues du locataire (« Reçue · Artisan choisi · Visite ·
 * Vous confirmez ») : faites en vert, l'étape courante cerclée et `aria-current="step"`. Le compte
 * des étapes faites suit le statut (`etapesFaites`).
 */
export function EtapesDeLaDemande({ statut, className }: EtapesDeLaDemandeProps) {
  const t = useTranslations('maintenance.locataire.envoyee');
  const faites = etapesFaites(statut);
  return (
    <ol aria-label={t('avancement')} className={cn('flex', className)}>
      {ETAPES.map((e, i) => (
        <li key={e} aria-current={i === faites ? 'step' : undefined} className="relative flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
          {i > 0 ? (
            <span
              className={cn('absolute right-1/2 top-2.5 h-0.5 w-full -translate-y-1/2', i <= faites - 1 ? 'bg-success' : 'bg-border')}
              aria-hidden="true"
            />
          ) : null}
          <span
            className={cn(
              'relative z-10 inline-flex size-5 items-center justify-center rounded-full border-2',
              i < faites ? 'border-success bg-success text-success-foreground' : i === faites ? 'border-foreground bg-card' : 'border-border bg-card',
            )}
          >
            {i < faites ? <Check className="size-3" strokeWidth={3} aria-hidden="true" /> : null}
          </span>
          <span className={cn('text-legende leading-tight', i <= faites ? 'font-medium text-foreground' : 'text-muted-foreground')}>
            {t(`etapes.${e}`)}
          </span>
        </li>
      ))}
    </ol>
  );
}
