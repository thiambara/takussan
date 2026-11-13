'use client';

import { useTranslations } from 'next-intl';
import { CheckCircle2, Circle, CircleDashed, Clock, XCircle } from 'lucide-react';

import { etapesDeLaFrise, type EtapeDeLaFrise } from '@/lib/maintenance/fiche';
import type { InterventionEnFile } from '@/lib/maintenance/files';
import { cn } from '@/lib/utils';

/**
 * TCK-2653 — la frise de la fiche de l'agence, alignée sur les files : Signalée · Chez le bailleur ·
 * En cours · À confirmer · Terminée. « Chez le bailleur » a son étape (audit P2) ; une demande qui l'a
 * dépassée sans devis la montre « sans objet », jamais « faite ». La frise des autres rôles reste
 * `MaintenanceStepper`.
 */
export function FriseDesFiles({ request }: { readonly request: InterventionEnFile }) {
  const t = useTranslations('maintenance.fiche.frise');
  const tStepper = useTranslations('maintenance.stepper');
  const etapes = etapesDeLaFrise(request);

  if (etapes === null) {
    return (
      <div data-slot="frise" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 md:p-5">
        <p className="flex items-center gap-3 font-semibold text-destructive">
          <XCircle className="size-5 shrink-0" aria-hidden="true" />
          {tStepper('cancelled')}
        </p>
      </div>
    );
  }

  return (
    <div data-slot="frise" className="rounded-xl border border-border bg-card px-2 py-4 md:px-4 md:py-5">
      <ol aria-label={t('label')} className="grid grid-cols-5">
        {etapes.map((e, i) => (
          <li key={e.cle} data-etape={e.cle} data-etat={e.etat} aria-current={e.etat === 'courante' ? 'step' : undefined} className="relative flex flex-col items-center gap-2 px-0.5 text-center">
            {i < etapes.length - 1 ? (
              <span aria-hidden="true" data-suivante={etapes[i + 1].etat} className="absolute top-3 left-1/2 h-0.5 w-full -translate-y-1/2 bg-primary/60 data-[suivante=a\_venir]:bg-border" />
            ) : null}
            <span className="relative flex bg-card px-1">
              <Pastille e={e} />
            </span>
            <span
              data-etat={e.etat}
              data-en-retard={e.enRetard || undefined}
              className="text-xs leading-tight font-medium text-balance text-muted-foreground data-[etat=courante]:text-foreground data-[etat=courante]:data-en-retard:text-destructive"
            >
              {e.enRetard ? t('en_retard') : t(e.cle)}
              {e.etat === 'sautee' ? <span className="sr-only"> · {t('sansObjet')}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Pastille({ e }: { readonly e: EtapeDeLaFrise }) {
  const p = { 'aria-hidden': true } as const;
  switch (e.etat) {
    case 'faite':
      return <CheckCircle2 {...p} className="size-6 text-primary" />;
    case 'courante':
      return <Clock {...p} className={cn('size-6', e.enRetard ? 'text-destructive' : 'text-primary')} />;
    case 'sautee':
      return <CircleDashed {...p} className="size-6 text-muted-foreground" />;
    default:
      return <Circle {...p} className="size-6 text-muted-foreground" />;
  }
}
