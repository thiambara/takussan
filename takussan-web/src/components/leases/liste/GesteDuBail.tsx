'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';

import { isReachable, whatsappHref } from '@/components/crm/contact';
import { Button, buttonVariants } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useMyProfiles } from '@/hooks/useProfiles';
import { apiRequest } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';
import type { BailDeLaListe, ElementDEntree, EntreeDAttention, MotifDAttention } from '@/lib/queries/leases-file';
import { useDemanderLaSignature } from '@/lib/queries/leases';
import { cn } from '@/lib/utils';
import type { ApiResponse } from '@/types/api';
import type { PaymentHistoryRow } from '@/types/invoice';

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
 * | `late_fee_unpaid` | « Relancer » : l'échéancier de la fiche, déplié (`?echeancier=toutes`), où « Marquer la pénalité réglée » se trouve |
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
  // Décision de team-lead du 2026-11-13 (point 1, option b) — la pénalité restée due porte sur une
  // échéance PAYÉE : ni lien de paiement ni note de relance ne s'y prennent (l'API rend 409), et un
  // message WhatsApp ne laisserait aucune trace. « Relancer » mène à l'échéancier de la fiche, où la
  // pénalité se marque réglée.
  if (motif === 'late_fee_unpaid') {
    return (
      <Link href={`/app/leases/${bail.id}?echeancier=toutes`} className={classes} data-slot="geste-du-bail">
        {libelle}
      </Link>
    );
  }
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
