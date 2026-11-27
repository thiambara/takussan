'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Camera, Check, CircleAlert, FileText, Upload } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useAutresCandidaturesDuBien, useDemanderUnePiece, useDossierDeLaReservation } from '@/lib/queries/booking-dossier';
import { PIECE_DU_DOSSIER_ACCEPT, PIECE_DU_DOSSIER_MAX_OCTETS, useDeposerUnePiece } from '@/lib/queries/booking-gestes-du-client';
import { demandeeRecemment, syntheseDeLaCandidature } from '@/lib/reservations/candidature';
import { codeDuRefus } from '@/lib/reservations/saisie-de-demande';
import { cn } from '@/lib/utils';
import type { Booking, DossierPiece, PieceDuDossier } from '@/types/booking';

import { InitialesDuClient, useAgeDeLaDemande, useNomDuClient } from '../liste/pieces';

/**
 * TCK-2875 (ADR-0110 § 2, maquette `app-reservations` a, e1 et e3) — le dossier d'une candidature
 * ou d'une offre : sa complétude (`Completude`, « 3/4 pièces »), ses pièces — « Ouvrir » une pièce
 * reçue, « Demander » une pièce manquante, tu 24 h après une demande — et, au bureau, la carte
 * « Décision » d'une candidature : la synthèse dérivée, « Comparer », Refuser / Accepter.
 */

/** La complétude d'un dossier : un segment par pièce attendue, « 3/4 pièces » (ou « 3/4 »). */
export function Completude({ recues, total, court, className }: { readonly recues: number; readonly total: number; readonly court?: boolean; readonly className?: string }) {
  const t = useTranslations('bookings.fiche.dossier');
  const complet = total > 0 && recues >= total;
  return (
    <span
      data-slot="completude"
      role="img"
      className={cn('inline-flex items-center gap-2 text-ui tabular-nums', complet ? 'text-success' : 'text-encre-douce', className)}
      aria-label={t('completudeAria', { recues, total })}
    >
      <span className="flex gap-0.5" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn('h-1.5 w-4 rounded-full', i < recues ? (complet ? 'bg-success' : 'bg-foreground/70') : 'bg-foreground/15')} />
        ))}
      </span>
      <span className="font-medium" aria-hidden="true">
        {court ? t('completudeCourte', { recues, total }) : t('completude', { recues, total })}
      </span>
    </span>
  );
}

/**
 * Les pièces du dossier : ce qui est là s'ouvre (au personnel, par la fiche du document), ce qui
 * manque se demande ou se dépose selon les gestes que l'API accorde (TCK-3007, ADR-0139). Lues par
 * `GET /api/bookings/{id}/dossier`.
 */
export function PiecesDuDossier({
  bookingId,
  personnel,
  demander = false,
  deposer = false,
  maintenant,
}: {
  readonly bookingId: number;
  /** Le personnel actif de l'agence : il OUVRE une pièce reçue (une lecture, pas un geste). */
  readonly personnel: boolean;
  /** `abilities.request_dossier_piece` : « Demander » une pièce manquante. */
  readonly demander?: boolean;
  /** TCK-2879 — `upload_dossier_piece` sans « Demander » : le client dépose lui-même chaque pièce manquante. */
  readonly deposer?: boolean;
  readonly maintenant: Date;
}) {
  const t = useTranslations('bookings.fiche.dossier');
  const tCommon = useTranslations('common');
  const lecture = useDossierDeLaReservation(bookingId);
  if (lecture.isPending) return <Skeleton className="h-40 rounded-lg" />;
  if (lecture.isError || !lecture.data) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('erreurLecture')}{' '}
        <button type="button" className="font-medium text-primary hover:underline" onClick={() => void lecture.refetch()}>
          {tCommon('actions.retry')}
        </button>
      </p>
    );
  }
  return (
    <ul data-slot="pieces-du-dossier" className="divide-y divide-border">
      {lecture.data.data.pieces.map((p) => (
        <LigneDePiece key={p.piece} bookingId={bookingId} p={p} personnel={personnel} peutDemander={demander} deposer={deposer} maintenant={maintenant} />
      ))}
    </ul>
  );
}

function LigneDePiece({
  bookingId,
  p,
  personnel,
  peutDemander,
  deposer,
  maintenant,
}: {
  readonly bookingId: number;
  readonly p: PieceDuDossier;
  readonly personnel: boolean;
  readonly peutDemander: boolean;
  readonly deposer: boolean;
  readonly maintenant: Date;
}) {
  const t = useTranslations('bookings.fiche.dossier');
  const f = useFormatteurs();
  const age = useAgeDeLaDemande(maintenant);
  const messageErreur = useMessageErreurApi();
  const demander = useDemanderUnePiece(bookingId);
  // La demande qui vient d'aboutir, avant que la relecture du dossier ne la date.
  const [demandeeA, setDemandeeA] = useState<string | null>(null);
  const [retour, setRetour] = useState<{ readonly texte: string; readonly erreur: boolean } | null>(null);
  const nom = t(`pieces.${p.piece}`);
  const recue = p.received && p.document !== null;
  const requestedAt = demandeeA ?? p.requested_at;
  const tue = demandeeRecemment(requestedAt, maintenant);
  const instant = requestedAt !== null && maintenant.getTime() - Date.parse(requestedAt) < 60_000;
  const etiquetteDemandee = instant ? t('demandeeInstant') : requestedAt ? t('demandee', { age: age(requestedAt) }) : '';

  const detail = recue
    ? t('recue', { document: p.document!.name, date: f.jourMois(p.received_at ?? p.document!.created_at, maintenant) })
    : t('pasEncore');

  async function envoyer() {
    setRetour(null);
    try {
      const reponse = await demander.mutateAsync({ piece: p.piece });
      setDemandeeA(reponse.data?.requested_at ?? new Date(maintenant.getTime()).toISOString());
      if (reponse.data && reponse.data.customer_notified === false) setRetour({ texte: t('sansCompte'), erreur: false });
    } catch (e) {
      const code = codeDuRefus(e);
      setRetour({
        texte: code === 'booking.dossier_request_throttled' ? t('erreurs.throttled') : code === 'booking.dossier_closed' ? t('erreurs.closed') : messageErreur(e),
        erreur: true,
      });
    }
  }

  return (
    <li data-slot="piece-du-dossier" data-piece={p.piece} className="flex min-h-13 flex-wrap items-center gap-3 py-2">
      <span
        className={cn('inline-flex size-8 flex-none items-center justify-center rounded-full', recue ? 'bg-success/15 text-success' : 'bg-warning/20 text-foreground')}
        aria-hidden="true"
      >
        {recue ? <Check className="size-4" /> : <CircleAlert className="size-4" strokeWidth={1.75} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{nom}</p>
        <p className="truncate text-ui text-muted-foreground">{detail}</p>
      </div>
      {recue && personnel ? (
        <Link
          href={`/app/documents/${p.document!.id}`}
          aria-label={t('ouvrirAria', { piece: nom })}
          className="inline-flex h-11 flex-none items-center gap-1.5 px-1 text-sm font-medium text-primary hover:underline"
        >
          <FileText className="size-4" strokeWidth={1.75} aria-hidden="true" />
          {t('ouvrir')}
        </Link>
      ) : null}
      {!recue && peutDemander ? (
        tue ? (
          <Button type="button" variant="outline" className="h-11 px-3" disabled title={t('demandeeMotif')}>
            {etiquetteDemandee}
          </Button>
        ) : (
          <Button type="button" variant="outline" className="h-11 px-3" aria-label={t('demanderAria', { piece: nom })} disabled={demander.isPending} onClick={() => void envoyer()}>
            {t('demander')}
          </Button>
        )
      ) : null}
      {/* TCK-2879 — le client dépose la pièce qui manque (jamais au personnel, qui la demande). */}
      {!recue && deposer ? <DepotDeLaPiece bookingId={bookingId} piece={p.piece} nom={nom} /> : null}
      {retour ? (
        <p role={retour.erreur ? 'alert' : 'status'} className={cn('basis-full text-ui', retour.erreur ? 'text-destructive' : 'text-muted-foreground')}>
          {retour.texte}
        </p>
      ) : null}
    </li>
  );
}

/**
 * TCK-2879 (ADR-0110 § 2) — le client dépose une pièce manquante : « Prendre une photo » au téléphone
 * (l'appareil photo, `capture`), « Déposer » un fichier au bureau, comme l'ajout au coffre (TCK-2656).
 * PDF, JPEG, PNG ou HEIC de 10 Mo au plus (`UploadBookingDossierPieceRequest`) ; la relecture du
 * dossier la marque reçue, et la carte de « Mes réservations » passe à « 4/4 ».
 */
function DepotDeLaPiece({ bookingId, piece, nom }: { readonly bookingId: number; readonly piece: DossierPiece; readonly nom: string }) {
  const t = useTranslations('bookings.fiche.dossier');
  const messageErreur = useMessageErreurApi();
  const deposer = useDeposerUnePiece(bookingId);
  const photo = useRef<HTMLInputElement>(null);
  const fichier = useRef<HTMLInputElement>(null);
  const [retour, setRetour] = useState<{ readonly texte: string; readonly erreur: boolean } | null>(null);

  async function envoyer(liste: FileList | null) {
    const choisi = liste?.[0];
    if (!choisi) return;
    if (choisi.size > PIECE_DU_DOSSIER_MAX_OCTETS) {
      setRetour({ texte: t('tropLourde'), erreur: true });
      return;
    }
    setRetour(null);
    try {
      await deposer.mutateAsync({ piece, file: choisi });
      setRetour({ texte: t('envoyee'), erreur: false });
    } catch (e) {
      setRetour({ texte: codeDuRefus(e) === 'booking.dossier_closed' ? t('erreurs.closed') : messageErreur(e), erreur: true });
    }
  }

  const entree = (ref: typeof photo, attributs: { accept: string; capture?: 'environment' }) => (
    <input
      ref={ref}
      type="file"
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      {...attributs}
      onChange={(e) => {
        void envoyer(e.target.files);
        e.target.value = '';
      }}
    />
  );

  return (
    <>
      {entree(photo, { accept: 'image/*', capture: 'environment' })}
      {entree(fichier, { accept: PIECE_DU_DOSSIER_ACCEPT })}
      <Button
        type="button"
        variant="outline"
        className="h-11 gap-1.5 px-3 md:hidden"
        aria-label={t('prendrePhotoAria', { piece: nom })}
        disabled={deposer.isPending}
        onClick={() => photo.current?.click()}
      >
        <Camera className="size-4" strokeWidth={1.75} aria-hidden="true" />
        {deposer.isPending ? t('envoiEnCours') : t('prendrePhoto')}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-11 gap-1.5 px-3 max-md:hidden"
        aria-label={t('deposerAria', { piece: nom })}
        disabled={deposer.isPending}
        onClick={() => fichier.current?.click()}
      >
        <Upload className="size-4" strokeWidth={1.75} aria-hidden="true" />
        {deposer.isPending ? t('envoiEnCours') : t('deposer')}
      </Button>
      {retour ? (
        <p role={retour.erreur ? 'alert' : 'status'} className={cn('basis-full text-ui', retour.erreur ? 'text-destructive' : 'text-muted-foreground')}>
          {retour.texte}
        </p>
      ) : null}
    </>
  );
}

/**
 * La synthèse d'une candidature, en une ou deux phrases : « Revenus de 3,2 fois le loyer, garant
 * déclaré. Il manque l'engagement du garant. » Ce que l'API ne sert pas au lecteur n'est pas dit.
 */
export function useSyntheseDeLaCandidature() {
  const t = useTranslations('bookings.fiche.decision');
  const f = useFormatteurs();
  return (b: Booking): string | null => {
    const s = syntheseDeLaCandidature(b);
    const debut: string[] = [];
    if (s.rapport !== undefined) debut.push(s.rapport === null ? t('revenusNonDeclares') : t('revenus', { rapport: f.nombre(s.rapport, { maximumFractionDigits: 1 }) }));
    if (s.garant !== undefined) debut.push(debut.length === 0 ? t('garantSeul', { oui: s.garant ? 'oui' : 'non' }) : t('garant', { oui: s.garant ? 'oui' : 'non' }));
    const phrases = debut.length > 0 ? [`${debut.join(', ')}.`] : [];
    if (s.manque !== undefined) phrases.push(s.manque === null ? t('complet') : t('manque', { piece: s.manque }));
    return phrases.length > 0 ? phrases.join(' ') : null;
  };
}

/**
 * « 1 autre candidature sur ce bien · Comparer » : la plus récente des autres candidatures en attente
 * du bien, son client et son dossier ; « Comparer » ouvre la liste des candidatures en attente du bien.
 */
export function AutresCandidatures({ b }: { readonly b: Booking }) {
  const n = b.other_pending_on_property ?? 0;
  if (n <= 0) return null;
  return <AutresCandidaturesLues b={b} n={n} />;
}

function AutresCandidaturesLues({ b, n }: { readonly b: Booking; readonly n: number }) {
  const t = useTranslations('bookings.fiche.decision');
  const nomDuClient = useNomDuClient();
  const lecture = useAutresCandidaturesDuBien(b.property_id);
  const autre = lecture.data?.data.find((x) => x.id !== b.id) ?? null;
  const nom = autre ? nomDuClient(autre) : null;
  return (
    <div data-slot="autres-candidatures" className="mt-3 flex min-h-11 items-center gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm">
      {nom ? <InitialesDuClient nom={nom} taille={28} /> : null}
      <span className="min-w-0 flex-1 leading-snug">
        {t('autres', { n })}
        {autre && nom && autre.dossier ? (
          <span className="block text-ui text-muted-foreground">{t('autreDossier', { nom, recues: autre.dossier.received, total: autre.dossier.required })}</span>
        ) : null}
      </span>
      <Link
        href={`/app/bookings?kind=application&status=pending&bien=${b.property_id}`}
        className={cn(buttonVariants({ variant: 'link' }), 'h-auto flex-none p-0 font-medium')}
      >
        {t('comparer')}
      </Link>
    </div>
  );
}
