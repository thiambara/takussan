'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarCheck, Star } from 'lucide-react';

import { PageHeader } from '@/components/console';
import { Pagination } from '@/components/console/Pagination';
import { EmptyState, ErrorState } from '@/components/feedback';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { buttonVariants } from '@/components/ui/button';
import { PuceDeFiltre, RangeeDePuces } from '@/components/ui/puce-de-filtre';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsCount, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMinuteCourante } from '@/hooks/useMinuteCourante';
import { useVueDansLUrl } from '@/hooks/useVueDansLUrl';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useBookingCounts, useBookings } from '@/lib/queries/bookings';
import { compteDuGroupe, groupeDeLUrl, GROUPES_DU_CLIENT, type GroupeDuClient, montantDansLaNature, STATUTS_DU_GROUPE } from '@/lib/reservations/liste-des-reservations';
import { cn } from '@/lib/utils';
import type { Booking } from '@/types/booking';

import { BOOKING_STATUS_LABEL_KEY, BOOKING_STATUS_TONE } from '../booking-status';
import { StatusBadge } from '@/components/console';
import { useAgeDeLaDemande, useBienEtQuartier, useMotsDeLaNature, VignetteDuBien } from './pieces';

/**
 * TCK-2594 — « Mes réservations », la vue du CLIENT (maquette `app-reservations` a, « Client — mes
 * réservations » et « Vide — client ») : trois groupes comptés — En cours, Terminées, Annulées —, une
 * carte par réservation dans les mots de sa nature, et, sans aucune réservation, « Vous n'avez pas
 * encore réservé. » avec « Parcourir les biens » (l'audit relève un vide sans bouton, et le texte du
 * client servi au personnel).
 *
 * Le groupe vit dans `?groupe=` ; chacun est un `filter[status]` du serveur (plusieurs statuts
 * séparés par des virgules), compté par la même lecture `counts` que la liste du personnel.
 */
export function MesReservations() {
  const t = useTranslations('bookings.client');
  const { params, remplacer } = useVueDansLUrl();
  const groupe: GroupeDuClient = groupeDeLUrl(params.get('groupe')) ?? 'en_cours';
  const comptesLus = useBookingCounts();
  const comptes = comptesLus.data?.data ?? null;
  const total = comptes ? GROUPES_DU_CLIENT.reduce((s, g) => s + compteDuGroupe(comptes, g), 0) : null;
  const choisir = (g: GroupeDuClient) => remplacer({ groupe: g === 'en_cours' ? null : g });
  const compte = (g: GroupeDuClient) => (comptes ? compteDuGroupe(comptes, g) : undefined);
  const aucune = total === 0;

  return (
    <PagePleineLargeur data-slot="mes-reservations" className="max-md:pb-6">
      <div className="max-md:hidden">
        <PageHeader
          title={t('titre')}
          description={comptes && !aucune ? t('sousTitre', { count: compteDuGroupe(comptes, 'en_cours') }) : undefined}
          dessous={
            <Tabs value={groupe} onValueChange={(v) => choisir(v as GroupeDuClient)} className="max-lg:hidden">
              <TabsList variant="line" aria-label={t('groupes.label')}>
                {GROUPES_DU_CLIENT.map((g) => (
                  <TabsTrigger key={g} value={g}>
                    {t(`groupes.${g}`)}
                    {!aucune && compte(g) !== undefined ? <TabsCount>{compte(g)}</TabsCount> : null}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          }
        />
      </div>

      {aucune ? (
        <VideDuClient />
      ) : (
        <>
          <RangeeDePuces aria-label={t('groupes.label')} className="md:mt-5 md:px-0 lg:hidden">
            {GROUPES_DU_CLIENT.map((g) => (
              <PuceDeFiltre key={g} active={g === groupe} compte={compte(g)} onClick={() => choisir(g)}>
                {t(`groupes.${g}`)}
              </PuceDeFiltre>
            ))}
          </RangeeDePuces>
          <ListeDuGroupe key={groupe} groupe={groupe} />
        </>
      )}
    </PagePleineLargeur>
  );
}

function VideDuClient() {
  const t = useTranslations('bookings.client');
  return (
    <EmptyState
      variant="nue"
      className="pt-20 lg:pt-24"
      icon={<CalendarCheck className="size-6" strokeWidth={1.75} aria-hidden="true" />}
      title={t('vide.titre')}
      description={t('vide.texte')}
      action={
        <LienLocalise href="/properties" className={buttonVariants()}>
          {t('vide.action')}
        </LienLocalise>
      }
    />
  );
}

function ListeDuGroupe({ groupe }: { readonly groupe: GroupeDuClient }) {
  const t = useTranslations('bookings.client');
  const tCommon = useTranslations('common');
  const [page, setPage] = useState(1);
  const lecture = useBookings({ status: STATUTS_DU_GROUPE[groupe].join(','), per_page: 30, page });
  const reservations = lecture.data?.data ?? [];

  if (lecture.isError) {
    return (
      <div className="px-4 pt-6 md:px-0">
        <ErrorState message={t('erreur')} onRetry={() => void lecture.refetch()} retryLabel={tCommon('actions.retry')} />
      </div>
    );
  }
  if (lecture.isPending) {
    return (
      <div className="grid grid-cols-1 gap-3 px-4 pt-1 md:px-0 lg:grid-cols-2 lg:gap-4 lg:pt-6" aria-busy="true">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    );
  }
  if (reservations.length === 0) {
    return <EmptyState variant="nue" icon={<CalendarCheck className="size-6" strokeWidth={1.75} aria-hidden="true" />} title={t(`videGroupe.${groupe}`)} />;
  }
  return (
    <div className="px-4 pb-6 pt-1 md:px-0 lg:pt-6">
      <ul className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2 lg:gap-4">
        {reservations.map((b) => (
          <CarteDeReservation key={b.id} b={b} />
        ))}
      </ul>
      {lecture.data?.meta && lecture.data.meta.last_page > 1 ? (
        <Pagination page={lecture.data.meta.current_page} lastPage={lecture.data.meta.last_page} onChange={setPage} />
      ) : null}
    </div>
  );
}

/** Une réservation du client (`CarteResa`) : la nature, le statut, le bien, quand, combien, la suite. */
function CarteDeReservation({ b }: { readonly b: Booking }) {
  const t = useTranslations('bookings');
  const f = useFormatteurs();
  const bienEtQuartier = useBienEtQuartier();
  const mots = useMotsDeLaNature();
  const age = useAgeDeLaDemande(useMinuteCourante());
  const m = montantDansLaNature(b);
  const quand =
    m.forme === 'nuits' && b.start_date && b.end_date
      ? t('client.quand.sejour', { debut: f.jourMois(b.start_date), fin: f.jourMois(b.end_date), nuits: m.nuits })
      : t('client.quand.deposee', { age: age(b.created_at) });
  // Le séjour dit son total nu (« 110 000 F ») : ses nuits sont déjà sur la ligne du dessus.
  const montant = m.forme === 'nuits' || m.forme === 'montant' ? f.montantCourt(m.montant, b.currency) : mots.montant(b);
  const avis = b.status === 'completed';
  return (
    <li className="rounded-xl border border-border bg-card p-3.5">
      <div className="flex gap-3">
        <VignetteDuBien src={b.property?.main_photo_url} className="size-16" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-ui font-medium text-muted-foreground">{b.kind ? t(`client.nature.${b.kind}`) : null}</span>
            <StatusBadge tone={BOOKING_STATUS_TONE[b.status]} label={t(BOOKING_STATUS_LABEL_KEY[b.status])} className="ml-auto" />
          </div>
          <p className="mt-0.5 text-corps leading-snug font-semibold">{bienEtQuartier(b)}</p>
          <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">{quand}</p>
          <p className="text-sm font-medium tabular-nums">{montant}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Link
          href={`/app/bookings/${b.id}`}
          className={cn(buttonVariants({ variant: 'outline' }), 'h-11 flex-1 gap-1.5')}
        >
          {avis ? <Star className="size-4" strokeWidth={1.75} aria-hidden="true" /> : null}
          {avis ? t('client.actions.avis') : t('client.actions.voir')}
        </Link>
      </div>
    </li>
  );
}
