'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Building2, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { GesteItineraire, GestesDuVisiteur } from '@/components/visits/par-le-temps/pieces';
import { estSansHeure, heureDeMinutes, jourDeLEvenement, minutesADakar, nuitsDuSejour } from '@/lib/agenda/agenda';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/types/calendar';
import type { PropertyVisit } from '@/types/visit';
import { useDatesDeLAgenda } from './dates';
import { titreDeLEvenement } from './JourDeLAgenda';
import { StatutDeLEvenement, TypeMot, cleDuType } from './pieces';

function LigneCle({ cle, children }: { readonly cle: string; readonly children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-baseline justify-between gap-4 py-2.5">
      <dt className="flex-none text-sm text-muted-foreground">{cle}</dt>
      <dd className="min-w-0 text-right text-sm font-medium">{children}</dd>
    </div>
  );
}

/** « Mar. 10 nov. · 10:57 → 11:27 », « Du lun. 2 nov. au mar. 24 nov. ». */
function useQuand() {
  const t = useTranslations('agenda.fiche');
  const d = useDatesDeLAgenda();
  return (e: CalendarEvent) => {
    if (e.type === 'booking') {
      const { arrivee, depart } = nuitsDuSejour(e);
      return t('du', { de: d.court(arrivee), a: d.court(depart) });
    }
    const jour = d.court(jourDeLEvenement(e));
    if (estSansHeure(e)) return t('journee', { jour });
    const debut = heureDeMinutes(minutesADakar(e.start));
    const fin = e.end && e.end !== e.start ? heureDeMinutes(minutesADakar(e.end)) : null;
    return fin ? `${jour} · ${debut} → ${fin}` : `${jour} · ${debut}`;
  };
}

/**
 * La fiche d'un événement (feuille du bas au téléphone, panneau droit au bureau) : le type en mots
 * et son état, le titre, quand, la durée, l'adresse et le visiteur d'une visite, la référence ; les
 * gestes de terrain d'une visite ; « Voir le bien ». L'ouverture de l'objet est au pied.
 */
export function FicheDEvenement({ evenement: e, visite }: { readonly evenement: CalendarEvent; readonly visite: PropertyVisit | undefined }) {
  const t = useTranslations('agenda.fiche');
  const quand = useQuand();
  const duree = typeof e.duration_minutes === 'number' && e.duration_minutes > 0 ? e.duration_minutes : null;
  const nom = e.visitor_name?.trim() || null;
  return (
    <div data-testid="calendar-event-detail" className="pt-1">
      <div className="flex flex-wrap items-center gap-2.5">
        <TypeMot evenement={e} />
        <StatutDeLEvenement evenement={e} />
      </div>
      <p className="mt-2 font-display text-xl font-semibold leading-snug tracking-titre text-balance">{titreDeLEvenement(e)}</p>
      <dl className="mt-3 divide-y divide-border border-y border-border">
        <LigneCle cle={t('quand')}>
          <span className="tabular-nums">{quand(e)}</span>
        </LigneCle>
        {duree && e.type === 'visit' ? <LigneCle cle={t('duree')}>{t('minutes', { n: duree })}</LigneCle> : null}
        {e.type === 'visit' && e.address_line ? <LigneCle cle={t('adresse')}>{e.address_line}</LigneCle> : null}
        {nom ? <LigneCle cle={t('visiteur')}>{nom}</LigneCle> : null}
        {e.reference ? (
          <LigneCle cle={t('reference')}>
            <span className="tabular-nums">{e.reference}</span>
          </LigneCle>
        ) : null}
      </dl>
      {e.type === 'visit' && visite ? (
        <div className="mt-4 flex gap-2">
          <GesteItineraire v={visite} className="flex-1" />
          <GestesDuVisiteur v={visite} nom={nom ?? t('visiteur')} bien={e.title} />
        </div>
      ) : null}
      {e.property_id ? (
        <Link
          href={`/app/properties/${e.property_id}`}
          data-testid="agenda-voir-le-bien"
          className="mt-3 flex h-12 items-center gap-3 rounded-lg text-corps outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring"
        >
          <Building2 className="size-icone text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          <span className="flex-1">{t('voirLeBien')}</span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

/** Le pied de la fiche : ouvrir la réservation, la visite, le bail, la tâche ou l'intervention. */
export function OuvrirLEvenement({ evenement: e, className }: { readonly evenement: CalendarEvent; readonly className?: string }) {
  const t = useTranslations('agenda.fiche.ouvrir');
  const cle = cleDuType(e) === 'lease_renewal' || cleDuType(e) === 'lease_end' ? 'lease' : e.type;
  return (
    <Link href={e.resource_url} data-testid="calendar-event-open-resource" className={cn(buttonVariants({ size: 'lg' }), 'w-full xl:w-auto', className)}>
      {t(cle)}
    </Link>
  );
}
