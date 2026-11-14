'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { AlarmClock, CalendarPlus, ChevronRight, Coffee, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

const LIGNE = 'flex min-h-16 w-full items-center gap-3 px-3.5 py-2.5 text-left outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring';

function Contenu({ icone, titre, detail }: { readonly icone: ReactNode; readonly titre: string; readonly detail: string }) {
  return (
    <>
      <span className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-muted text-encre-douce" aria-hidden="true">
        {icone}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-corps font-semibold">{titre}</span>
        <span className="block truncate text-ui text-muted-foreground">{detail}</span>
      </span>
      <ChevronRight className="size-5 flex-none text-muted-foreground" aria-hidden="true" />
    </>
  );
}

/**
 * « Journée libre » (maquette `JourneeLibre`) : rien de prévu, rien à régler — de quoi prendre de
 * l'avance : les prospects à relancer, planifier une visite, ajouter un client.
 */
export function JourneeLibre({ aRelancer, onPlanifier, className }: { readonly aRelancer: number | null; readonly onPlanifier: () => void; readonly className?: string }) {
  const t = useTranslations('journee.libre');
  const icone = 'size-4.5';
  return (
    <div data-slot="journee-libre" className={className}>
      <div className="flex flex-col items-center px-6 text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-secondary text-primary-deep" aria-hidden="true">
          <Coffee className="size-6" strokeWidth={1.5} />
        </span>
        <p className="mt-4 font-display text-2xl font-semibold tracking-titre">{t('titre')}</p>
        <p className="mt-1.5 max-w-xs text-corps text-muted-foreground">{t('texte')}</p>
      </div>
      <ul className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {aRelancer !== null && aRelancer > 0 ? (
          <li>
            <Link href="/app/customers?vue=a-relancer" className={LIGNE}>
              <Contenu icone={<AlarmClock className={icone} strokeWidth={1.75} />} titre={t('relancer', { n: aRelancer })} detail={t('relancerDetail')} />
            </Link>
          </li>
        ) : null}
        <li>
          <button type="button" onClick={onPlanifier} className={cn(LIGNE)}>
            <Contenu icone={<CalendarPlus className={icone} strokeWidth={1.75} />} titre={t('planifier')} detail={t('planifierDetail')} />
          </button>
        </li>
        <li>
          <Link href="/app/customers/new" className={LIGNE}>
            <Contenu icone={<UserPlus className={icone} strokeWidth={1.75} />} titre={t('client')} detail={t('clientDetail')} />
          </Link>
        </li>
      </ul>
    </div>
  );
}
