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
import { useBookingCounts, useBookings, useCancelBooking } from '@/lib/queries/bookings';
import { acomptesDus, appelDuClient, clientPeutAnnuler, formeDeLEcheance, type AppelDuClient } from '@/lib/reservations/appel-du-client';
import { compteDuGroupe, groupeDeLUrl, GROUPES_DU_CLIENT, type GroupeDuClient, montantDansLaNature, STATUTS_DU_GROUPE } from '@/lib/reservations/liste-des-reservations';
import { cn } from '@/lib/utils';
import type { Booking } from '@/types/booking';

import { BOOKING_STATUS_LABEL_KEY, BOOKING_STATUS_TONE } from '../booking-status';
import { StatusBadge } from '@/components/console';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { FeuilleDeDecision } from '../feuilles/FeuilleDeDecision';
import { ReponseALaContreOffre } from './contre-offre-du-client';
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
  // TCK-2879 — « 3 en cours, dont un acompte à payer avant jeudi » : la première page des réservations en
  // cours (la même lecture que la liste du groupe « En cours » : une seule requête quand il est ouvert).
  const enCours = useBookings({ status: STATUTS_DU_GROUPE.en_cours.join(','), per_page: 30, page: 1 });
  const sousTitre = useSousTitre(comptes ? compteDuGroupe(comptes, 'en_cours') : null, enCours.data?.data ?? []);

  return (
    <PagePleineLargeur data-slot="mes-reservations" className="max-md:pb-6">
      <div className="max-md:hidden">
        <PageHeader
          title={t('titre')}
          description={!aucune && sousTitre ? sousTitre : undefined}
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
  // TCK-2879 — « Annuler » passe par la confirmation de la fiche (`FeuilleDeDecision`), montée pour la seule carte visée.
  const [aAnnuler, setAAnnuler] = useState<Booking | null>(null);

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
          <CarteDeReservation key={b.id} b={b} onAnnuler={() => setAAnnuler(b)} />
        ))}
      </ul>
      {aAnnuler ? <AnnulationDeLaCarte key={aAnnuler.id} b={aAnnuler} onClose={() => setAAnnuler(null)} /> : null}
      {lecture.data?.meta && lecture.data.meta.last_page > 1 ? (
        <Pagination page={lecture.data.meta.current_page} lastPage={lecture.data.meta.last_page} onChange={setPage} />
      ) : null}
    </div>
  );
}

/**
 * TCK-2879 — le sous-titre du bureau : « 3 en cours », et « dont un acompte à payer avant jeudi » quand
 * une réservation en cours attend son acompte (la plus proche échéance).
 */
function useSousTitre(compte: number | null, enCours: readonly Booking[]): string | null {
  const t = useTranslations('bookings.client');
  const jour = useJourDeLEcheance();
  if (compte === null) return null;
  const { n, premier } = acomptesDus(enCours);
  if (n === 0 || compte === 0) return t('sousTitre', { count: compte });
  const echeance = premier ? jour(premier) : { forme: 'maintenant' as const, jour: '' };
  return t('sousTitreAcompte', { count: compte, n, forme: echeance.forme, jour: echeance.jour });
}

/** « jeudi » dans les six jours, « 21 nov. » au-delà (la phrase dit « avant le ») ; rien quand le jour est là. */
function useJourDeLEcheance() {
  const f = useFormatteurs();
  const maintenant = useMinuteCourante();
  return (jour: string) => {
    const forme = formeDeLEcheance(jour, maintenant);
    const midi = `${jour.slice(0, 10)}T12:00:00Z`;
    return { forme, jour: forme === 'semaine' ? f.date(midi, { dateStyle: undefined, weekday: 'long' }) : forme === 'date' ? f.jourMois(midi, maintenant) : '' };
  };
}

/**
 * Une réservation du client (`CarteResa`) : la nature, le statut, le bien, quand, combien, puis
 * (TCK-2879) l'encart de ce qu'on attend de lui et son geste — un seul, par priorité — et « Annuler ».
 */
function CarteDeReservation({ b, onAnnuler }: { readonly b: Booking; readonly onAnnuler: () => void }) {
  const t = useTranslations('bookings');
  const f = useFormatteurs();
  const bienEtQuartier = useBienEtQuartier();
  const mots = useMotsDeLaNature();
  const maintenant = useMinuteCourante();
  const age = useAgeDeLaDemande(maintenant);
  const m = montantDansLaNature(b);
  const quand =
    m.forme === 'nuits' && b.start_date && b.end_date
      ? t('client.quand.sejour', { debut: f.jourMois(b.start_date), fin: f.jourMois(b.end_date), nuits: m.nuits })
      : t('client.quand.deposee', { age: age(b.created_at) });
  // Le séjour dit son total nu (« 110 000 F ») : ses nuits sont déjà sur la ligne du dessus.
  const montant = m.forme === 'nuits' || m.forme === 'montant' ? f.montantCourt(m.montant, b.currency) : mots.montant(b);
  const appel = appelDuClient(b);
  const annulable = clientPeutAnnuler(b, maintenant);
  return (
    <li data-slot="carte-de-reservation" className="rounded-xl border border-border bg-card p-3.5">
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
      {appel.geste === 'contre_offre' ? (
        // La contre-offre porte ses deux gestes ; « Annuler » reste dans la fiche (trois gestes ne tiennent pas à 390).
        <ReponseALaContreOffre bookingId={b.id} co={appel.contreOffre} devise={b.currency} className="mt-3" />
      ) : (
        <>
          <EncartDAppel appel={appel} devise={b.currency} />
          <div className="mt-3 flex items-center gap-2">
            <GesteDeLaCarte b={b} appel={appel} />
            {annulable ? (
              <Button
                type="button"
                variant="ghost"
                className="h-11 flex-none px-3 text-destructive hover:text-destructive"
                aria-label={t('client.actions.annulerAria', { bien: bienEtQuartier(b) })}
                onClick={onAnnuler}
              >
                {t('client.actions.annuler')}
              </Button>
            ) : null}
          </div>
        </>
      )}
    </li>
  );
}

/** L'encart d'appel : sur fond d'alerte quand un paiement presse (l'acompte), en sourdine sinon (maquette). */
function EncartDAppel({ appel, devise }: { readonly appel: AppelDuClient; readonly devise: string | null | undefined }) {
  const t = useTranslations('bookings.client.appel');
  const f = useFormatteurs();
  const jour = useJourDeLEcheance();
  const montant = (v: number) => f.montantCourt(v, devise ?? 'XOF');
  let texte: string | null = null;
  if (appel.geste === 'acompte') {
    const e = appel.avant ? jour(appel.avant) : { forme: 'maintenant' as const, jour: '' };
    texte = t('acompte', { montant: montant(appel.montant), forme: e.forme, jour: e.jour });
  } else if (appel.geste === 'solde') {
    texte = t('solde', { montant: montant(appel.montant), acompte: appel.acomptePaye ? 'oui' : 'non' });
  } else if (appel.geste === 'dossier') {
    texte = t('dossier', { recues: appel.recues, total: appel.total, piece: t(`pieces.${appel.manquante}`) });
  } else if (appel.geste === null && appel.dossierComplet) {
    texte = t('dossierComplet', { recues: appel.dossierComplet.recues, total: appel.dossierComplet.total });
  }
  if (!texte) return null;
  return (
    <p data-slot="encart-d-appel" className={cn('mt-3 rounded-lg px-3 py-2 text-sm leading-snug', appel.geste === 'acompte' ? 'bg-warning/15' : 'bg-muted/60 text-foreground')}>
      {texte}
    </p>
  );
}

/**
 * Le geste de la carte : « Payer l'acompte » (primaire), « Payer le solde » et « Compléter mon dossier »
 * mènent à la section de la fiche qui le porte (`#paiement`, `#dossier`) ; sans rien d'attendu, le lien
 * vers la réservation (ou « Laisser un avis » d'une terminée).
 */
function GesteDeLaCarte({ b, appel }: { readonly b: Booking; readonly appel: AppelDuClient }) {
  const t = useTranslations('bookings');
  const base = `/app/bookings/${b.id}`;
  if (appel.geste === 'acompte' || appel.geste === 'solde' || appel.geste === 'dossier') {
    const href = appel.geste === 'dossier' ? `${base}#dossier` : `${base}#paiement`;
    const libelle = appel.geste === 'acompte' ? 'payerAcompte' : appel.geste === 'solde' ? 'payerSolde' : 'completerDossier';
    // Plein pour l'acompte seul (maquette : `primaire`), contour pour le solde et le dossier.
    const variante: 'default' | 'outline' = appel.geste === 'acompte' ? 'default' : 'outline';
    return (
      <Link href={href} className={cn(buttonVariants({ variant: variante }), 'h-11 flex-1 gap-1.5')}>
        {t(`client.actions.${libelle}`)}
      </Link>
    );
  }
  const avis = b.status === 'completed';
  return (
    <Link href={base} className={cn(buttonVariants({ variant: 'outline' }), 'h-11 flex-1 gap-1.5')}>
      {avis ? <Star className="size-4" strokeWidth={1.75} aria-hidden="true" /> : null}
      {avis ? t('client.actions.avis') : t('client.actions.voir')}
    </Link>
  );
}

/** « Annuler » d'une carte : la feuille de la fiche (le motif en toutes lettres), puis `POST …/cancel`. */
function AnnulationDeLaCarte({ b, onClose }: { readonly b: Booking; readonly onClose: () => void }) {
  const t = useTranslations('bookings.client');
  const toast = useToast();
  const annuler = useCancelBooking(b.id);
  return (
    <FeuilleDeDecision
      action="cancel"
      nature={b.kind ?? 'autre'}
      prenom=""
      pending={annuler.isPending}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onSubmit={async ({ reason }) => {
        await annuler.mutateAsync({ reason });
        toast.add({ title: t('toasts.annulee'), type: 'success' });
        onClose();
      }}
    />
  );
}
