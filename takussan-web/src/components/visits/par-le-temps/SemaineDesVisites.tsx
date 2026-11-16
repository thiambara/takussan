'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useDatesDeLAgenda } from '@/components/agenda/dates';
import { NavPeriode } from '@/components/agenda/pieces';
import { SemaineDeLAgenda } from '@/components/agenda/SemaineDeLAgenda';
import { lundiDe } from '@/lib/agenda/agenda';
import { decalerJour } from '@/lib/jour-de-l-api';
import { type AffinageDesVisites, useVisitesDeLaVue } from '@/lib/queries/visits';
import { instantADakar } from '@/lib/visites/heure-de-dakar';
import { jourADakar } from '@/lib/visites/par-le-temps';
import type { CalendarEvent } from '@/types/calendar';
import type { PropertyVisit, VisitStatus } from '@/types/visit';

import { nomDuVisiteur } from './pieces';

/**
 * TCK-2882 — la vue « Semaine » des Visites (bureau, mode « Par le temps ») : la semaine de l'Agenda
 * (`SemaineDeLAgenda`, TCK-2597) réduite aux visites, aux mêmes filtres que la liste (Agent, Bien,
 * recherche, Statut). UNE requête : la semaine affichée, du lundi 00:00 au lundi suivant 00:00 à
 * Dakar, en sparse fieldsets (ceux de la liste).
 *
 * Sans filtre de statut, la semaine montre les visites qui ont lieu ou ont eu lieu — toutes sauf les
 * annulées, comme l'Agenda (`GET /api/calendar` ne rend que demandées et confirmées).
 */

/** Le plafond de `per_page` de l'API (`HasQueryBuilder::PER_PAGE_MAX`). */
export const VISITES_PAR_SEMAINE = 100;

/** Les statuts que la semaine montre sans filtre : tout sauf l'annulée. */
const STATUTS_DE_LA_SEMAINE: readonly VisitStatus[] = ['scheduled', 'confirmed', 'completed', 'no_show'];

/** La borne de la semaine de `jour` (lundi 00:00 → lundi suivant 00:00, Dakar), et le statut. */
export function filtreDeLaSemaine(jour: string, statut: string | null): Record<string, string> {
  const lundi = lundiDe(jour);
  return {
    scheduled_at_min: instantADakar(lundi, '00:00'),
    // Borne haute inclusive côté API : une seconde avant le lundi suivant.
    scheduled_at_max: new Date(Date.parse(instantADakar(decalerJour(lundi, 7), '00:00')) - 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    status: statut ?? STATUTS_DE_LA_SEMAINE.join(','),
  };
}

/** Une visite en événement de l'Agenda : une demande par tranche se range en « sans heure ». */
export function evenementDeLaVisite(v: PropertyVisit, repli: string): CalendarEvent {
  const tranche = v.status === 'scheduled' ? (v.preferred_window ?? null) : null;
  return {
    id: v.id,
    type: 'visit',
    title: v.property?.title?.trim() || repli,
    start: tranche && v.scheduled_at ? jourADakar(new Date(v.scheduled_at)) : (v.scheduled_at ?? ''),
    end: null,
    status: v.status ?? 'scheduled',
    all_day: tranche !== null,
    duration_minutes: v.duration_minutes ?? null,
    property_id: v.property_id,
    property_slug: v.property?.slug ?? null,
    kind: tranche ? 'window' : null,
    visitor_name: nomDuVisiteur(v),
    address_line: v.property?.address?.line ?? null,
    neighborhood: v.property?.address?.neighborhood ?? null,
    preferred_window: tranche,
    resource_url: `/app/visits/${v.id}`,
  };
}

export function SemaineDesVisites({
  jour,
  maintenant,
  affinage,
  statut,
  onChoisirJour,
  onPlanifier,
}: {
  readonly jour: string;
  readonly maintenant: Date;
  readonly affinage: AffinageDesVisites;
  readonly statut: string | null;
  readonly onChoisirJour: (jour: string) => void;
  /** Un créneau vide planifie à son jour et à son heure (personnel) ; `null` : rien. */
  readonly onPlanifier: ((jour: string, heure: string | null) => void) | null;
}) {
  const t = useTranslations('visits.parLeTemps');
  const tVisits = useTranslations('visits');
  const d = useDatesDeLAgenda();
  const router = useRouter();
  const [ouvert, setOuvert] = useState<CalendarEvent | null>(null);
  const aujourdhui = jourADakar(maintenant);
  const lundi = lundiDe(jour);
  // La période du bureau (`jusquA`) ne borne pas une semaine : la semaine EST la période.
  const { jusquA: _periode, ...filtres } = affinage;
  void _periode;
  const q = useVisitesDeLaVue(filtreDeLaSemaine(jour, statut), 'scheduled_at', filtres, 1, VISITES_PAR_SEMAINE);
  const visites = useMemo(() => q.data?.data ?? [], [q.data]);
  const evenements = useMemo(() => visites.filter((v) => v.scheduled_at).map((v) => evenementDeLaVisite(v, tVisits('fallbackTitle', { id: String(v.id) }))), [visites, tVisits]);
  const parId = useMemo(() => new Map(visites.map((v) => [v.id, v])), [visites]);
  const total = q.data?.meta.total ?? visites.length;

  return (
    <div data-slot="semaine-des-visites" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <NavPeriode
          periode={d.semaine(lundi, decalerJour(lundi, 6))}
          onPrecedent={() => onChoisirJour(decalerJour(jour, -7))}
          onAujourdhui={() => onChoisirJour(aujourdhui)}
          onSuivant={() => onChoisirJour(decalerJour(jour, 7))}
        />
        {q.isSuccess ? <span className="ml-auto text-sm tabular-nums text-muted-foreground">{t('semaine.compte', { n: total })}</span> : null}
      </div>
      {total > visites.length ? (
        <p role="status" className="text-sm text-warning">
          {t('semaine.tronquee', { n: visites.length, total })}
        </p>
      ) : null}
      {q.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {t('erreur')}
        </p>
      ) : null}
      <SemaineDeLAgenda
        jour={jour}
        aujourdhui={aujourdhui}
        maintenant={maintenant}
        evenements={evenements}
        visites={parId}
        sejoursDuJour={[]}
        ouvert={ouvert}
        onOuvrir={(e) => {
          setOuvert(e);
          router.push(e.resource_url);
        }}
        onChoisirJour={onChoisirJour}
        onPlanifier={(j, h) => onPlanifier?.(j, h)}
        onOccupation={null}
      />
    </div>
  );
}
