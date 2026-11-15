'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';

import { estPenaliteHorsLigne } from '@/components/admin/finances/impayes/penalite-hors-ligne';
import { isReachable, whatsappHref } from '@/components/crm/contact';
import { Button, buttonVariants } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useMyProfiles } from '@/hooks/useProfiles';
import { apiRequest } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';
import type { BailDeLaListe, ElementDEntree, EntreeDAttention, MotifDAttention } from '@/lib/queries/leases-file';
import { fetchAllLeasePayments, useDemanderLaSignature } from '@/lib/queries/leases';
import { cn } from '@/lib/utils';
import type { ApiResponse } from '@/types/api';
import type { PaymentHistoryRow } from '@/types/invoice';
import type { LeasePayment } from '@/types/lease';

import { TON_DU_MOTIF, type LectureDuBail } from './lecture';

// La feuille de relance de l'écran des impayés (TCK-2660) : chargée au premier « Relancer ».
const FeuilleDeRelance = dynamic(() => import('@/components/admin/finances/impayes/Impayes').then((m) => m.FeuilleDeRelance));

/**
 * TCK-2644 — LE geste d'une ligne de la file « À traiter », selon son premier motif :
 *
 * | motif | geste |
 * |---|---|
 * | `signature_pending` | « Relancer la signature » : `POST /api/leases/{id}/signature-request` |
 * | `notice_received` | « Programmer l'état des lieux » : `/app/inventories/new?lease=…&type=move_out` |
 * | `rent_late` | « Relancer » : la feuille de relance de TCK-2660 sur l'échéance en retard |
 * | `late_fee_unpaid` | « Relancer » : la même feuille, pour la pénalité de retard SEULE de l'échéance payée (TCK-2778) |
 * | `rent_review_open` | « Réviser » : la fiche, feuille ouverte (`?geste=reviser`) |
 * | `ending_soon` | « Proposer le renouvellement » : la fiche (`?geste=renouveler`) |
 * | `deposit_to_refund` | « Restituer la caution » : la fiche (`?geste=restituer`) |
 * | `onboarding_incomplete` | « Relancer la locataire » : WhatsApp, ce qui manque, sans lien |
 *
 * Les lignes de l'index ne portent pas de capacités : Réviser, Renouveler et Restituer passent par la
 * fiche, qui les juge (`GESTES_PAR_LIEN` de `LeaseDetail`). Sans numéro joignable, « Relancer » d'un
 * loyer cède la place à « Copier le lien de paiement », avec la raison (AC6).
 */
export interface GesteDuBailProps {
  readonly bail: BailDeLaListe;
  readonly entree: EntreeDAttention;
  readonly lecture: LectureDuBail;
  /** Ce qui manque à l'entrée (onglet « En attente du locataire » et motif `onboarding_incomplete`). */
  readonly manquants?: readonly ElementDEntree[];
  /** `carte` : bouton pleine largeur de 44 px (téléphone) ; `rangee` : petit, libellé court (tableau). */
  readonly forme: 'carte' | 'rangee';
}

const GESTES_DE_LA_FICHE: Partial<Record<MotifDAttention, string>> = {
  rent_review_open: 'reviser',
  ending_soon: 'renouveler',
  deposit_to_refund: 'restituer',
};

function classesDuGeste(motif: MotifDAttention, forme: 'carte' | 'rangee', className?: string) {
  return cn(
    buttonVariants({ variant: TON_DU_MOTIF[motif] === 'danger' ? 'sombre' : 'outline', size: forme === 'carte' ? 'lg' : 'sm' }),
    forme === 'carte' ? 'h-11 w-full' : 'whitespace-nowrap',
    className,
  );
}

export function GesteDuBail({ bail, entree, lecture, manquants, forme }: GesteDuBailProps) {
  const { motif } = entree;
  const libelle = lecture.geste(motif, forme === 'rangee');
  const classes = classesDuGeste(motif, forme);

  if (motif === 'notice_received') {
    return (
      <Link href={`/app/inventories/new?lease=${bail.id}&type=move_out`} className={classes} data-slot="geste-du-bail">
        {libelle}
      </Link>
    );
  }
  // TCK-2778 — la pénalité restée due sur une échéance PAYÉE se relance comme un loyer : la feuille de
  // TCK-2660, le message de la pénalité, son lien s'il est permis, et la relance notée (`late_fee`).
  if (motif === 'late_fee_unpaid') return <RelancerLaPenalite bail={bail} entree={entree} libelle={libelle} classes={classes} forme={forme} />;
  const gesteDeLaFiche = GESTES_DE_LA_FICHE[motif];
  if (gesteDeLaFiche) {
    return (
      <Link href={`/app/leases/${bail.id}?geste=${gesteDeLaFiche}`} className={classes} data-slot="geste-du-bail">
        {libelle}
      </Link>
    );
  }
  if (motif === 'signature_pending') return <RelancerLaSignature bail={bail} libelle={libelle} classes={classes} />;
  if (motif === 'rent_late') return <RelancerLeLoyer bail={bail} entree={entree} libelle={libelle} classes={classes} forme={forme} />;
  return <RelancerParWhatsApp bail={bail} manquants={manquants} libelle={libelle} classes={classes} forme={forme} />;
}

function RelancerLaSignature({ bail, libelle, classes }: { readonly bail: BailDeLaListe; readonly libelle: string; readonly classes: string }) {
  const t = useTranslations('lease.liste.relance');
  const toast = useToast();
  const messageErreur = useMessageErreurApi();
  const demander = useDemanderLaSignature();
  return (
    <Button
      type="button"
      className={classes}
      data-slot="geste-du-bail"
      aria-disabled={demander.isPending ? true : undefined}
      onClick={() => {
        if (demander.isPending) return;
        demander.mutate(
          { leaseId: bail.id },
          {
            onSuccess: () => toast.add({ title: t('signatureRelancee'), type: 'success' }),
            onError: (e) => toast.add({ title: t('signatureEchec'), description: messageErreur(e), type: 'error' }),
          },
        );
      }}
    >
      {libelle}
    </Button>
  );
}

/**
 * L'échéance en retard que l'entrée désigne (`attention.due_date`), lue dans l'historique du bail :
 * la ligne de loyer porte l'identifiant que le lien de paiement et la note de relance attendent. À
 * défaut de la même date, la plus ancienne échéance de loyer en retard.
 */
async function lireLEcheanceEnRetard(bailId: number, dueDate: string | undefined, token: string | null): Promise<PaymentHistoryRow | null> {
  const reponse = await apiRequest<ApiResponse<PaymentHistoryRow[]>>(
    `${cheminApi`/api/payments/history`}?filter[entity_type]=lease&filter[entity_id]=${bailId}&filter[days_late_min]=1&include=payer,property,reminders&sort=date&per_page=20`,
    { token: token ?? undefined },
  );
  const loyers = reponse.data.filter((r) => r.source === 'lease' && r.payment_type === 'rent');
  return loyers.find((r) => r.due_date?.slice(0, 10) === dueDate?.slice(0, 10)) ?? loyers[0] ?? null;
}

/**
 * TCK-2778 — l'échéance PAYÉE dont la pénalité de retard reste seule due, avec ses verdicts : lue dans
 * l'échéancier du bail (`LeasePaymentResource` porte `late_fee_reminder_allowed` et
 * `late_fee_link_allowed` ; l'historique, non). L'échéance de l'entrée (`attention.due_date`, la plus
 * ancienne), à défaut la plus ancienne que l'API admet. Le front ne refait pas la règle.
 */
async function lireLaPenaliteDue(bailId: number, dueDate: string | undefined, token: string | null): Promise<LeasePayment | null> {
  const { data } = await fetchAllLeasePayments(bailId, { token: token ?? undefined });
  const admises = data.filter((p) => p.late_fee_reminder_allowed === true);
  return admises.find((p) => p.due_date?.slice(0, 10) === dueDate?.slice(0, 10)) ?? admises[0] ?? null;
}

/**
 * La ligne d'historique de cette échéance, dont la feuille lit le payeur (prénom, langue, téléphone),
 * le bien et la dernière relance : bornée au JOUR de son règlement (`paid_from`/`paid_to`, `paid_at`
 * seul), puis retrouvée par son identifiant.
 */
async function lireLaLigneDeLEcheance(bailId: number, echeance: LeasePayment, token: string | null): Promise<PaymentHistoryRow | null> {
  const jour = echeance.paid_at?.slice(0, 10);
  if (!jour) return null;
  const reponse = await apiRequest<ApiResponse<PaymentHistoryRow[]>>(
    `${cheminApi`/api/payments/history`}?filter[entity_type]=lease&filter[entity_id]=${bailId}&filter[paid_from]=${jour}&filter[paid_to]=${jour}&include=payer,property,reminders&per_page=50`,
    { token: token ?? undefined },
  );
  return reponse.data.find((r) => r.source === 'lease' && r.id === echeance.id) ?? null;
}

function RelancerLaPenalite({
  bail,
  entree,
  libelle,
  classes,
  forme,
}: {
  readonly bail: BailDeLaListe;
  readonly entree: EntreeDAttention;
  readonly libelle: string;
  readonly classes: string;
  readonly forme: 'carte' | 'rangee';
}) {
  const t = useTranslations('lease.liste.relance');
  const { token } = useAuth();
  const toast = useToast();
  const messageErreur = useMessageErreurApi();
  const raisonId = useId();
  const [lecture, setLecture] = useState<'repos' | 'enCours'>('repos');
  const [relance, setRelance] = useState<{ readonly row: PaymentHistoryRow; readonly lienPermis: boolean; readonly ouverte: boolean } | null>(null);
  const [copie, setCopie] = useState(false);
  const joignable = isReachable(bail.tenant?.phone);

  const ouvrir = async () => {
    if (lecture === 'enCours') return;
    setLecture('enCours');
    try {
      const echeance = await lireLaPenaliteDue(bail.id, entree.due_date, token);
      if (!echeance) {
        toast.add({ title: t('penaliteIntrouvable'), type: 'error' });
        return;
      }
      const lienPermis = echeance.late_fee_link_allowed === true;
      if (joignable) {
        const row = await lireLaLigneDeLEcheance(bail.id, echeance, token);
        if (!row) {
          toast.add({ title: t('penaliteIntrouvable'), type: 'error' });
          return;
        }
        setRelance({ row, lienPermis, ouverte: true });
        return;
      }
      // Sans numéro : le lien de la pénalité, créé puis copié — s'il est permis.
      if (!lienPermis) {
        toast.add({ title: t('penaliteHorsLigne'), type: 'error' });
        return;
      }
      const lien = await apiRequest<ApiResponse<{ url: string }>>(cheminApi`/api/lease-payments/${echeance.id}/payment-link`, {
        method: 'POST',
        body: {},
        token: token ?? undefined,
      });
      await navigator.clipboard?.writeText(lien.data.url);
      setCopie(true);
    } catch (e) {
      toast.add(estPenaliteHorsLigne(e) ? { title: t('penaliteHorsLigne'), type: 'error' } : { title: t('lienEchec'), description: messageErreur(e), type: 'error' });
    } finally {
      setLecture('repos');
    }
  };

  return (
    <>
      <Button
        type="button"
        className={classes}
        data-slot="geste-du-bail"
        aria-disabled={lecture === 'enCours' ? true : undefined}
        aria-describedby={joignable ? undefined : raisonId}
        onClick={() => void ouvrir()}
      >
        {joignable ? libelle : copie ? t('lienCopie') : t('copierLeLien')}
      </Button>
      {joignable ? null : (
        <p id={raisonId} className={cn('text-ui text-muted-foreground', forme === 'carte' ? 'mt-2' : 'mt-1 max-w-56 text-left whitespace-normal')}>
          {t('sansTelephone')}
        </p>
      )}
      {relance ? (
        <FeuilleDeRelance
          row={relance.row}
          penalite={{ lienPermis: relance.lienPermis }}
          ouverte={relance.ouverte}
          onFermer={() => setRelance({ ...relance, ouverte: false })}
        />
      ) : null}
    </>
  );
}

function RelancerLeLoyer({
  bail,
  entree,
  libelle,
  classes,
  forme,
}: {
  readonly bail: BailDeLaListe;
  readonly entree: EntreeDAttention;
  readonly libelle: string;
  readonly classes: string;
  readonly forme: 'carte' | 'rangee';
}) {
  const t = useTranslations('lease.liste.relance');
  const { token } = useAuth();
  const toast = useToast();
  const messageErreur = useMessageErreurApi();
  const raisonId = useId();
  const [lecture, setLecture] = useState<'repos' | 'enCours'>('repos');
  const [relance, setRelance] = useState<{ readonly row: PaymentHistoryRow; readonly ouverte: boolean } | null>(null);
  const [copie, setCopie] = useState(false);
  const joignable = isReachable(bail.tenant?.phone);

  const ouvrir = async () => {
    if (lecture === 'enCours') return;
    setLecture('enCours');
    try {
      const row = await lireLEcheanceEnRetard(bail.id, entree.due_date, token);
      if (!row) {
        toast.add({ title: t('echeanceIntrouvable'), type: 'error' });
        return;
      }
      if (joignable) {
        setRelance({ row, ouverte: true });
        return;
      }
      // Sans numéro : le lien de l'échéance, créé puis copié — l'agent l'envoie lui-même.
      const lien = await apiRequest<ApiResponse<{ url: string }>>(cheminApi`/api/lease-payments/${row.id}/payment-link`, {
        method: 'POST',
        body: {},
        token: token ?? undefined,
      });
      await navigator.clipboard?.writeText(lien.data.url);
      setCopie(true);
    } catch (e) {
      toast.add({ title: t('lienEchec'), description: messageErreur(e), type: 'error' });
    } finally {
      setLecture('repos');
    }
  };

  return (
    <>
      <Button
        type="button"
        className={classes}
        data-slot="geste-du-bail"
        aria-disabled={lecture === 'enCours' ? true : undefined}
        aria-describedby={joignable ? undefined : raisonId}
        onClick={() => void ouvrir()}
      >
        {joignable ? libelle : copie ? t('lienCopie') : t('copierLeLien')}
      </Button>
      {joignable ? null : (
        <p id={raisonId} className={cn('text-ui text-muted-foreground', forme === 'carte' ? 'mt-2' : 'mt-1 max-w-56 text-left whitespace-normal')}>
          {t('sansTelephone')}
        </p>
      )}
      {relance ? <FeuilleDeRelance row={relance.row} ouverte={relance.ouverte} onFermer={() => setRelance({ ...relance, ouverte: false })} /> : null}
    </>
  );
}

/** Le nom de l'agence du profil actif (décision 3 de TCK-2660 : le message la nomme). */
function useNomDeLAgence(): string | null {
  const { activeProfileId } = useAuth();
  const profils = useMyProfiles();
  const idActif = activeProfileId ?? profils.data?.meta.active_profile_id ?? null;
  return profils.data?.data.find((p) => p.id === idActif)?.agency?.name ?? null;
}

/**
 * L'entrée incomplète : WhatsApp, un message dans la langue de l'écran qui dit ce qui reste, sans
 * lien. Sans numéro joignable, le geste est désactivé et dit pourquoi.
 */
function RelancerParWhatsApp({
  bail,
  manquants,
  libelle,
  classes,
  forme,
}: {
  readonly bail: BailDeLaListe;
  readonly manquants?: readonly ElementDEntree[];
  readonly libelle: string;
  readonly classes: string;
  readonly forme: 'carte' | 'rangee';
}) {
  const t = useTranslations('lease.liste.relance');
  const agence = useNomDeLAgence();
  const raisonId = useId();
  const telephone = bail.tenant?.phone;
  const prenom = bail.tenant?.first_name?.trim() || t('message.vous');
  const bien = bail.property?.title ?? '';
  const signature = agence ? ` ${t('message.agence', { agence })}` : '';

  if (!isReachable(telephone)) {
    return (
      <>
        <Button type="button" className={classes} data-slot="geste-du-bail" disabled aria-describedby={raisonId}>
          {libelle}
        </Button>
        <p id={raisonId} className={cn('text-ui text-muted-foreground', forme === 'carte' ? 'mt-2' : 'mt-1 max-w-56 text-left whitespace-normal')}>
          {t('sansTelephoneMessage')}
        </p>
      </>
    );
  }

  const texte =
    manquants && manquants.length > 0
      ? t('message.entree', { prenom, bien, elements: manquants.map((m) => t(`elements.${m}`)).join(', ') })
      : t('message.entreeSansDetail', { prenom, bien });

  return (
    <a href={whatsappHref(telephone, `${texte}${signature}`)} target="_blank" rel="noopener noreferrer" className={classes} data-slot="geste-du-bail">
      {libelle}
    </a>
  );
}
