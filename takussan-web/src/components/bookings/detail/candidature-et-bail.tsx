'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { BellRing, Check, CheckCircle2, TrendingUp } from 'lucide-react';

import { Entree } from '@/components/customer-dashboard/fiche/FilDuClient';
import { Button } from '@/components/ui/button';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useFormatteurs, type Formatteurs } from '@/lib/format/useFormatteurs';
import { useVisitesDuClient } from '@/lib/queries/booking-dossier';
import { useAnnulerLePassageDEtape } from '@/lib/queries/candidature-et-bail';
import type { EntreeDuFil } from '@/lib/queries/customer-timeline';
import { cleDeLEntree } from '@/lib/crm/fil-du-client';
import { jourADakar } from '@/lib/visites/par-le-temps';
import type { Booking } from '@/types/booking';

import { CarteDuBureau, SectionDuTelephone } from './pieces-du-detail';

/**
 * TCK-2878 (maquette `app-fil-commercial` a, e6 « La candidature arrive » et e7 « Acceptée : le
 * bail ») — ce que la fiche d'une candidature dit de son ORIGINE et de sa SUITE : le bandeau du dépôt
 * (« par le lien envoyé après la visite » pour une candidature venue de l'invitation), l'acceptation,
 * le passage de la fiche client en Négociation et son retour, et le fil du client de sa demande à la
 * décision. Le fil est la lecture partagée de la fiche (`useVisitesDuClient`) : une requête, jamais deux.
 */

/** « dim. 8 nov. » */
function jourCourt(f: Formatteurs, at: string): string {
  return f.date(at, { dateStyle: undefined, weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * Le bandeau du dépôt (e6, téléphone) : « Mouhamed a déposé sa candidature · dim. 8 nov. · 20:12 · par le
 * lien envoyé après la visite ». Une candidature SAISIE par le personnel (`source = staff`) n'a pas été
 * déposée par le client : rien.
 */
export function BandeauDOrigine({ booking, prenom }: { readonly booking: Booking; readonly prenom: string }) {
  const t = useTranslations('bookings.fiche.origine');
  const f = useFormatteurs();
  const depot = booking.created_at ?? booking.booking_date;
  if (booking.kind !== 'application' || booking.status !== 'pending' || booking.source === 'staff' || !depot) return null;
  const quand = [jourCourt(f, depot), f.heure(depot), booking.source === 'invitation' ? t('parLeLien') : null].filter(Boolean).join(' · ');
  return (
    <div data-slot="bandeau-d-origine" className="flex items-center gap-3 rounded-xl border border-primary/35 bg-secondary/60 px-3.5 py-3">
      <BellRing className="size-5 flex-none text-primary-deep" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm leading-snug">
        <span className="font-semibold">{t('depose', { prenom })}</span>
        <span className="block text-ui text-muted-foreground">{quand}</span>
      </p>
    </div>
  );
}

/** Le sous-titre du bureau (e6) : « Déposée dim. 8 nov. à 20:12 par le lien envoyé après la visite ». */
export function useDepotEnClair(): (booking: Booking) => string | null {
  const t = useTranslations('bookings.fiche.origine');
  const f = useFormatteurs();
  return (booking) => {
    const depot = booking.created_at ?? booking.booking_date;
    if (booking.kind !== 'application' || booking.status !== 'pending' || booking.source === 'staff' || !depot) return null;
    return t('deposee', { jour: jourCourt(f, depot), heure: f.heure(depot), invitation: booking.source === 'invitation' ? 'oui' : 'non' });
  };
}

/**
 * L'acceptation (e7) : « Candidature acceptée · lun. 9 nov. · 09:05 · Mouhamed est prévenu ». Le canal
 * n'est pas dit : l'API prévient par e-mail, et sur le mobile seulement s'il est vérifié (WhatsApp
 * d'abord, le SMS sinon — TCK-2874). Un client sans compte n'est pas prévenu : la phrase se tait.
 */
export function BandeauAcceptee({ booking, prenom }: { readonly booking: Booking; readonly prenom: string }) {
  const t = useTranslations('bookings.fiche.acceptee');
  const f = useFormatteurs();
  const le = booking.confirmed_at ?? booking.confirmation_date;
  const prevenu = typeof booking.customer?.user_id === 'number';
  const detail = [le ? jourCourt(f, le) : null, le ? f.heure(le) : null, prevenu ? t('prevenu', { prenom }) : null].filter(Boolean).join(' · ');
  return (
    <div data-slot="bandeau-acceptee" className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 px-3.5 py-3">
      <CheckCircle2 className="size-5 flex-none text-success" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm leading-snug">
        <span className="font-semibold">{t('titre')}</span>
        {detail ? <span className="block text-ui text-muted-foreground">{detail}</span> : null}
      </p>
    </div>
  );
}

/**
 * « Passé en Négociation · Annuler » (e7, ADR-0110 § 8) : l'acceptation a fait avancer la fiche du
 * client (`stage_change`, au seul personnel). « Annuler » existe tant que `undoable_until` n'est pas
 * passé ; après le retour, l'encart dit « Étape remise en Qualifié ». Une erreur (409 : l'étape a
 * changé depuis ; 422 : délai passé) se dit sous l'encart, et la réservation se relit.
 */
export function EtapeDuClient({ booking, maintenant }: { readonly booking: Booking; readonly maintenant: Date }) {
  const t = useTranslations('bookings.fiche.etape');
  const tStage = useTranslations('crm.pipeline.stage');
  const messageErreur = useMessageErreurApi();
  const annuler = useAnnulerLePassageDEtape(booking.customer_id, booking.id);
  const [remise, setRemise] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const sc = booking.stage_change;
  if (!sc) return null;
  const etape = (s: string) => (tStage.has(s) ? tStage(s) : s);
  const annulee = remise || !!sc.undone_at;
  const annulable = !annulee && !!sc.undoable_until && Date.parse(sc.undoable_until) > maintenant.getTime();
  const surAnnuler = async () => {
    setErreur(null);
    try {
      await annuler.mutateAsync();
      setRemise(true);
    } catch (e) {
      setErreur(messageErreur(e, t('echec')));
    }
  };
  return (
    <div data-slot="etape-du-client">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3">
        <TrendingUp className="size-5 flex-none text-primary-deep" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm leading-snug" role="status">
          {annulee ? (
            <span className="font-semibold">{t('remise', { etape: etape(sc.from) })}</span>
          ) : (
            <>
              <span className="font-semibold">{t('passe', { etape: etape(sc.to) })}</span>
              <span className="ml-1 inline-flex size-4 items-center justify-center rounded-full bg-success align-[-2px] text-success-foreground">
                <Check className="size-3" aria-hidden="true" />
              </span>
              <span className="block text-ui text-muted-foreground">{t('detail', { de: etape(sc.from), a: etape(sc.to) })}</span>
            </>
          )}
        </p>
        {annulable ? (
          <Button type="button" variant="ghost" size="sm" className="flex-none text-primary" onClick={() => void surAnnuler()} disabled={annuler.isPending}>
            {t('annuler')}
          </Button>
        ) : null}
      </div>
      {erreur ? (
        <p role="alert" className="mt-1.5 text-ui text-destructive">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}

/** Les entrées du fil qui racontent le chemin du client : sa demande, ses visites, ses comptes rendus, les gestes, ses réservations. */
function entreesDuChemin(entrees: readonly EntreeDuFil[]): EntreeDuFil[] {
  return entrees.filter((e) => e.type !== 'note' || e.kind === 'lead_message' || e.kind === 'visit_report');
}

/** Les lignes montrées : les plus récentes d'abord, comme le fil de la fiche client. */
const LIGNES_DU_FIL = 12;

/**
 * Le nombre de jours de la demande au bail : du PREMIER fait du fil (au jour de Dakar) à l'acceptation.
 * `null` si le fil lu n'est pas entier (une page de plus existe : le premier fait n'est pas connu).
 */
export function joursDeLaDemandeAuBail(entrees: readonly EntreeDuFil[], acceptation: string | null | undefined, entier: boolean): number | null {
  if (!acceptation || !entier || entrees.length === 0) return null;
  const premier = entrees.reduce((min, e) => (Date.parse(e.at) < Date.parse(min) ? e.at : min), entrees[0]!.at);
  const jours = Math.round((Date.parse(jourADakar(new Date(acceptation))) - Date.parse(jourADakar(new Date(premier)))) / 86_400_000);
  return jours >= 0 ? jours : null;
}

/**
 * « Le fil de {prénom} » (e6/e7 bureau, carte à droite, lien « Fiche client ») et « De la demande au
 * bail · N jours » (e7 téléphone) : le chemin du client lu au fil de sa fiche, du plus récent au plus
 * ancien — sa demande, la visite, le compte rendu, le lien envoyé, la candidature, l'acceptation.
 */
export function FilDeLaCandidature({
  booking,
  prenom,
  forme,
}: {
  readonly booking: Booking;
  readonly prenom: string;
  readonly forme: 'carte' | 'section';
}) {
  const t = useTranslations('bookings.fiche.fil');
  const fil = useVisitesDuClient(booking.customer_id);
  const entrees = fil.data ? entreesDuChemin(fil.data.data) : [];
  const entier = (fil.data?.meta?.last_page ?? 1) <= 1;
  const acceptee = booking.status === 'confirmed' || booking.status === 'completed';
  const jours = acceptee ? joursDeLaDemandeAuBail(entrees, booking.confirmed_at ?? booking.confirmation_date, entier) : null;
  const montrees = entrees.slice(0, LIGNES_DU_FIL);
  const liste =
    montrees.length > 0 ? (
      <ol data-slot="fil-de-la-candidature">
        {montrees.map((e, i) => (
          <Entree key={cleDeLEntree(e)} entree={e} dernier={i === montrees.length - 1} />
        ))}
      </ol>
    ) : (
      <p className="text-sm text-muted-foreground">{fil.isLoading ? t('chargement') : t('vide')}</p>
    );
  const lienFiche = (
    <Link href={`/app/customers/${booking.customer_id}`} className="text-ui font-medium text-primary underline-offset-2 hover:underline">
      {t('ficheClient')}
    </Link>
  );
  if (forme === 'carte') {
    return (
      <CarteDuBureau titre={t('titre', { prenom })} action={lienFiche}>
        <div className="p-4">{liste}</div>
      </CarteDuBureau>
    );
  }
  return (
    <SectionDuTelephone
      titre={t('demandeAuBail')}
      action={jours !== null ? <span className="text-ui text-muted-foreground tabular-nums">{t('jours', { n: jours })}</span> : undefined}
    >
      {liste}
    </SectionDuTelephone>
  );
}
