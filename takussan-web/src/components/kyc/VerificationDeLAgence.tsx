'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { BadgeCheck, Camera, Check, ChevronDown, Clock, FileText, History, Landmark, Send, TriangleAlert, Upload, X } from 'lucide-react';

import { StatusBadge, type StatusTone } from '@/components/console/StatusBadge';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { demainIso, etatEcheance } from '@/lib/kyc-echeance';
import { lienPieceKyc } from '@/lib/lien-piece-kyc';
import { agencyKycKey } from '@/lib/queries/agency-queues';
import { fetchAgencyKyc, submitAgencyKyc, uploadAgencyKycDocument } from '@/lib/queries/kyc';
import { DUREE_URL_SIGNEE_KYC_MS, rafraichirAvantExpiration } from '@/lib/url-signee';
import { cn } from '@/lib/utils';
import {
  PIECES,
  PIECES_NUMEROTEES,
  etatDeLaVerification,
  historiqueDuDossier,
  pieceRemplacable,
  piecesDuDossier,
  piecesManquantes,
  type EtatDeLaVerification,
  type TypeDePiece,
} from '@/lib/verification-de-l-agence';
import type { KycDocument, KycDossier } from '@/types/super-admin';

import { KYC_MIME_ACCEPT } from './kyc-mime-accept';

/**
 * TCK-2671 — « Vérification de l'agence » (maquette `app-identite-agence`, écran « Vérification ») :
 * un état, une phrase, une action ; les pièces avec leur numéro ; le renouvellement de la pièce du
 * dirigeant ; l'historique replié au téléphone, en colonne au bureau dès `xl`.
 *
 * Aucun bouton n'est désactivé sans sa raison écrite à côté (`aria-describedby`) : un envoi incomplet
 * se refuse au clic, et dit ce qui manque sous le bouton.
 */

/** `AcceptedUploads::kyc(10240)` d'`UploadKycDocumentRequest` (TCK-2150) : la pièce part telle quelle. */
const PIECE_MAX_OCTETS = 10 * 1024 * 1024;

/** La photo : les seuls types d'image que l'API admet (`KYC_MIME_ACCEPT`), jamais `image/*` (un GIF partirait en 422). */
const ACCEPT_PHOTO = KYC_MIME_ACCEPT.split(',')
  .filter((type) => type.startsWith('image/'))
  .join(',');
const PIECE_MAX_MO = PIECE_MAX_OCTETS / (1024 * 1024);

const TON_DU_STATUT: Record<EtatDeLaVerification, StatusTone> = {
  a_fournir: 'attention',
  pret: 'info',
  en_examen: 'info',
  verifiee: 'success',
  refusee: 'danger',
  a_renouveler: 'attention',
};

export interface VerificationDeLAgenceProps {
  readonly agencyId: number;
  /** Les numéros des mentions légales (ADR-0104) : ils préremplissent celui d'une pièce qui n'en porte pas. */
  readonly numeros?: Partial<Record<'rccm' | 'ninea', string | null>>;
  /** Pour les tests : le jour qui juge les échéances. */
  readonly maintenant?: Date;
}

export function VerificationDeLAgence({ agencyId, numeros = {}, maintenant }: VerificationDeLAgenceProps) {
  const t = useTranslations('kyc.verification');
  const query = useQuery({
    queryKey: agencyKycKey(agencyId),
    queryFn: () => fetchAgencyKyc(agencyId),
    // TCK-1024 — les pièces portent un `signed_url` de 15 min.
    ...rafraichirAvantExpiration(DUREE_URL_SIGNEE_KYC_MS),
  });

  if (query.isPending) return <Skeleton className="h-72 rounded-xl" />;
  if (query.isError || !query.data?.data) {
    return (
      <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <p className="font-medium text-destructive">{t('chargement')}</p>
        <Button type="button" variant="outline" size="lg" className="mt-3" onClick={() => void query.refetch()}>
          {t('reessayer')}
        </Button>
      </div>
    );
  }

  return <Verification agencyId={agencyId} dossier={query.data.data} numeros={numeros} maintenant={maintenant ?? new Date()} />;
}

function Verification({
  agencyId,
  dossier,
  numeros,
  maintenant,
}: {
  readonly agencyId: number;
  readonly dossier: KycDossier;
  readonly numeros: Partial<Record<'rccm' | 'ninea', string | null>>;
  readonly maintenant: Date;
}) {
  const t = useTranslations('kyc.verification');
  const etat = etatDeLaVerification(dossier, maintenant);
  const pieces = piecesDuDossier(dossier);
  const manquantes = piecesManquantes(dossier, maintenant);
  // « Corriger » (refusée) et « Remplacer » ouvrent l'envoi de la pièce dans sa ligne.
  const [ouvertes, setOuvertes] = useState<ReadonlySet<TypeDePiece>>(new Set());
  const ouvrir = (type: TypeDePiece) => setOuvertes((s) => new Set(s).add(type));
  const fermer = (type: TypeDePiece) =>
    setOuvertes((s) => {
      const n = new Set(s);
      n.delete(type);
      return n;
    });
  const idPieces = useId();

  // Le renouvellement se fait dans l'encart d'état ; les autres pièces, dans leur ligne.
  const renouvellementDansLEncart = etat === 'a_renouveler';

  return (
    <div className="flex items-start gap-6 max-xl:flex-col max-xl:items-stretch">
      <div className="min-w-0 flex-1 space-y-4">
        <EncartDEtat
          agencyId={agencyId}
          dossier={dossier}
          etat={etat}
          manquantes={manquantes}
          maintenant={maintenant}
          onCorriger={() => {
            const premiere = (dossier.status === 'rejected' ? PIECES : manquantes)[0];
            PIECES.forEach(ouvrir);
            document.getElementById(`${idPieces}-${premiere}`)?.scrollIntoView({ block: 'center' });
          }}
        />

        <section aria-labelledby={`${idPieces}-titre`} className="rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <h3 id={`${idPieces}-titre`} className="min-w-0 flex-1 truncate text-corps font-semibold">
              {t('pieces.titre')}
            </h3>
            <StatusBadge label={t(`statut.${etat}`)} tone={TON_DU_STATUT[etat]} />
          </div>
          {PIECES.map((type) => (
            <LigneDePiece
              key={type}
              id={`${idPieces}-${type}`}
              agencyId={agencyId}
              dossier={dossier}
              type={type}
              piece={pieces[type]}
              numeroDeLaFiche={type === 'director_id' ? null : (numeros[type] ?? null)}
              maintenant={maintenant}
              ouverte={ouvertes.has(type) || (!pieces[type] && etat !== 'en_examen')}
              // La pièce du dirigeant à renouveler s'envoie depuis l'encart du haut.
              remplacable={pieceRemplacable(dossier, type, maintenant) && !(renouvellementDansLEncart && type === 'director_id')}
              onOuvrir={() => ouvrir(type)}
              onEnvoyee={() => fermer(type)}
            />
          ))}
        </section>

        {/* Au téléphone, l'historique se replie sous les pièces ; au bureau, il est en colonne. */}
        <HistoriqueReplie dossier={dossier} className="md:hidden" />

        <div className="rounded-xl bg-muted/50 p-4 text-sm">
          <p className="font-semibold">{t('apport.titre')}</p>
          <ul className="mt-2 space-y-1.5 text-encre-douce">
            <li className="flex gap-2">
              <BadgeCheck className="mt-0.5 size-4 flex-none text-accent" strokeWidth={1.75} aria-hidden="true" />
              {t('apport.badge')}
            </li>
            <li className="flex gap-2">
              <Landmark className="mt-0.5 size-4 flex-none text-accent" strokeWidth={1.75} aria-hidden="true" />
              {t('apport.reversements')}
            </li>
          </ul>
        </div>
      </div>

      <HistoriqueEnColonne dossier={dossier} className="max-md:hidden xl:w-[17.5rem] xl:flex-none" />
    </div>
  );
}

/* ── L'encart d'état : la phrase, et l'action ── */

function EncartDEtat({
  agencyId,
  dossier,
  etat,
  manquantes,
  maintenant,
  onCorriger,
}: {
  readonly agencyId: number;
  readonly dossier: KycDossier;
  readonly etat: EtatDeLaVerification;
  readonly manquantes: readonly TypeDePiece[];
  readonly maintenant: Date;
  readonly onCorriger: () => void;
}) {
  const t = useTranslations('kyc.verification');
  const fmt = useFormatteurs();
  const locale = useLocale();
  const idBloque = useId();

  // À renouveler : déjà échue (la pièce, ou le dossier vérifié) ou bientôt — la phrase change de temps.
  const echeanceDuDossier = dossier.status === 'verified' ? (dossier.expires_at ?? null) : null;
  const bientot = etat === 'a_renouveler' && echeanceDuDossier !== null && etatEcheance(echeanceDuDossier, maintenant) !== 'expired';

  const ton = etat === 'refusee' ? 'danger' : etat === 'a_renouveler' || etat === 'a_fournir' ? 'attention' : etat === 'verifiee' ? 'succes' : 'info';
  const Icone = etat === 'verifiee' ? BadgeCheck : etat === 'en_examen' ? Clock : etat === 'pret' ? Send : TriangleAlert;

  let titre: string;
  let texte: ReactNode;
  if (etat === 'a_renouveler') {
    titre = bientot ? t('etat.a_renouveler.titreBientot', { date: fmt.date(echeanceDuDossier) }) : t('etat.a_renouveler.titre');
    texte = t.rich(bientot ? 'etat.a_renouveler.texteBientot' : 'etat.a_renouveler.texte', {
      b: (morceau) => <span className="font-semibold">{morceau}</span>,
    });
  } else if (etat === 'en_examen') {
    titre = t('etat.en_examen.titre');
    texte = dossier.submitted_at ? t('etat.en_examen.texte', { date: fmt.date(dossier.submitted_at) }) : t('etat.en_examen.texteSansDate');
  } else {
    titre = t(`etat.${etat}.titre`);
    texte = t(`etat.${etat}.texte`);
  }

  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        ton === 'attention' && 'border-warning/30 bg-warning/10',
        ton === 'danger' && 'border-destructive/25 bg-destructive/6',
        ton === 'succes' && 'border-success/25 bg-success/10',
        ton === 'info' && 'border-border bg-card',
      )}
    >
      <div className="flex items-start gap-3">
        <Icone
          className={cn(
            'mt-0.5 size-5 flex-none',
            ton === 'attention' && 'text-warning',
            ton === 'danger' && 'text-destructive',
            ton === 'succes' && 'text-success',
            ton === 'info' && 'text-accent',
          )}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-titre-court font-semibold tracking-titre">{titre}</h3>
          <p className="mt-1 text-sm text-encre-douce">{texte}</p>
          {etat === 'refusee' && dossier.rejection_reason ? (
            <p className="mt-2.5 rounded-lg bg-card px-3 py-2 text-sm font-medium">« {dossier.rejection_reason} »</p>
          ) : null}
          {etat === 'verifiee' && dossier.expires_at ? (
            <p className="mt-2 text-xs tabular-nums text-muted-foreground">{t('pieces.valableJusquau', { date: fmt.date(dossier.expires_at) })}</p>
          ) : null}
        </div>
      </div>

      {etat === 'a_renouveler' ? (
        <EnvoiDePiece
          agencyId={agencyId}
          type="director_id"
          dossier={dossier}
          libelleEnvoi={t('actions.remplacerPieceIdentite')}
          disposition="encart"
          numeroInitial={null}
          aide={t('envoi.formatsDirigeant', { max: PIECE_MAX_MO })}
        />
      ) : null}

      {etat === 'refusee' ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" size="xl" className="max-md:w-full" onClick={onCorriger}>
            {t('actions.corriger')}
          </Button>
          <Soumission agencyId={agencyId} libelle={t('actions.renvoyer')} variante="outline" />
        </div>
      ) : null}

      {etat === 'pret' ? (
        <div className="mt-4">
          <Soumission agencyId={agencyId} libelle={t('actions.soumettre')} />
        </div>
      ) : null}

      {etat === 'a_fournir' ? (
        <div className="mt-4">
          {/* Le seul bouton désactivé de l'écran, et sa raison est écrite à côté (AC2). */}
          <Button type="button" size="xl" className="max-md:w-full" disabled aria-describedby={idBloque}>
            <Send className="size-4" aria-hidden="true" />
            {t('actions.soumettre')}
          </Button>
          <p id={idBloque} className="mt-2 text-sm text-muted-foreground">
            {t('soumettreBloque', {
              liste: new Intl.ListFormat(locale, { type: 'conjunction' }).format(manquantes.map((m) => t(`pieces.${m}`))),
            })}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Soumission({
  agencyId,
  libelle,
  variante = 'default',
}: {
  readonly agencyId: number;
  readonly libelle: string;
  readonly variante?: 'default' | 'outline';
}) {
  const t = useTranslations('kyc.verification');
  const toast = useToast();
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const [erreur, setErreur] = useState<string | null>(null);
  const idErreur = useId();
  const soumission = useMutation({
    mutationFn: () => submitAgencyKyc(agencyId),
    onSuccess: async () => {
      setErreur(null);
      toast.add({ title: t('soumission.reussie'), type: 'success' });
      await queryClient.invalidateQueries({ queryKey: agencyKycKey(agencyId) });
    },
    onError: (e) => setErreur(messageErreur(e, t('soumission.echec'))),
  });
  return (
    <div className="max-md:w-full">
      <Button
        type="button"
        size="xl"
        variant={variante}
        className="max-md:w-full"
        aria-busy={soumission.isPending || undefined}
        aria-describedby={erreur ? idErreur : undefined}
        onClick={() => {
          if (!soumission.isPending) soumission.mutate();
        }}
      >
        <Send className="size-4" aria-hidden="true" />
        {soumission.isPending ? t('actions.envoiEnCours') : libelle}
      </Button>
      {erreur ? (
        <p id={idErreur} role="alert" className="mt-2 text-sm font-medium text-destructive">
          {t('soumission.echec')} {erreur}
        </p>
      ) : null}
    </div>
  );
}

/* ── Une pièce du dossier ── */

function LigneDePiece({
  id,
  agencyId,
  dossier,
  type,
  piece,
  numeroDeLaFiche,
  maintenant,
  ouverte,
  remplacable,
  onOuvrir,
  onEnvoyee,
}: {
  readonly id: string;
  readonly agencyId: number;
  readonly dossier: KycDossier;
  readonly type: TypeDePiece;
  readonly piece: KycDocument | undefined;
  readonly numeroDeLaFiche: string | null;
  readonly maintenant: Date;
  readonly ouverte: boolean;
  readonly remplacable: boolean;
  readonly onOuvrir: () => void;
  readonly onEnvoyee: () => void;
}) {
  const t = useTranslations('kyc.verification');
  const tExpiry = useTranslations('kyc.expiry');
  const fmt = useFormatteurs();
  const echeance = type === 'director_id' ? etatEcheance(piece?.document_expires_at, maintenant) : null;
  const ok = Boolean(piece) && echeance !== 'expired';
  const numerotee = PIECES_NUMEROTEES.includes(type);
  const libelle = t(`pieces.${type}`);

  const detail = piece ? [numerotee ? piece.document_number : null, piece.file_name].filter(Boolean).join(' · ') : t('pieces.aFournir');
  let note: string | null = null;
  if (piece && numerotee) note = dossier.status === 'verified' ? t('pieces.noteVerifiee') : t('pieces.noteFournie');
  if (piece && type === 'director_id' && piece.document_expires_at) {
    note =
      echeance === 'expired'
        ? t('pieces.expireeLe', { date: fmt.date(piece.document_expires_at) })
        : t('pieces.valableJusquau', { date: fmt.date(piece.document_expires_at) });
  }

  return (
    <div id={id} className="border-b border-border/70 px-4 py-3 last:border-b-0">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 inline-flex size-6 flex-none items-center justify-center rounded-full',
            ok ? 'bg-success/15 text-success' : 'bg-destructive/10 text-destructive',
          )}
          aria-hidden="true"
        >
          {ok ? <Check className="size-3.5" strokeWidth={2.5} /> : <X className="size-3.5" strokeWidth={2.5} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-corps font-semibold">{libelle}</p>
          <p className="break-words text-ui tabular-nums text-muted-foreground">{detail}</p>
          {note ? <p className={cn('mt-0.5 text-ui', ok ? 'text-muted-foreground' : 'font-medium text-destructive')}>{note}</p> : null}
        </div>
        <div className="flex flex-none items-center gap-3">
          {echeance === 'expired' ? <StatusBadge label={t('pieces.expiree')} tone="danger" /> : null}
          {echeance === 'soon' ? <StatusBadge label={tExpiry('soonBadge')} tone="attention" /> : null}
          {piece && echeance !== 'expired' ? (
            <a
              href={lienPieceKyc(piece.signed_url)}
              target="_blank"
              rel="noreferrer"
              aria-label={t('actions.voirAria', { piece: libelle })}
              className="text-sm font-medium text-primary hover:underline"
            >
              {t('actions.voir')}
            </a>
          ) : null}
          {piece && remplacable && !ouverte ? (
            <button
              type="button"
              className="text-sm font-medium text-primary hover:underline"
              aria-label={t('actions.remplacerAria', { piece: libelle })}
              onClick={onOuvrir}
            >
              {t('actions.remplacer')}
            </button>
          ) : null}
        </div>
      </div>
      {ouverte && remplacable ? (
        <div className="mt-3 pl-9 max-md:pl-0">
          <EnvoiDePiece
            agencyId={agencyId}
            type={type}
            dossier={dossier}
            libelleEnvoi={t('actions.envoyerPiece')}
            disposition="ligne"
            numeroInitial={piece?.document_number ?? numeroDeLaFiche}
            aide={type === 'director_id' ? t('envoi.formatsDirigeant', { max: PIECE_MAX_MO }) : t('envoi.formats', { max: PIECE_MAX_MO })}
            onEnvoyee={onEnvoyee}
          />
        </div>
      ) : null}
    </div>
  );
}

/* ── Envoyer une pièce : photo ou fichier, numéro ou échéance, puis l'envoi ── */

function EnvoiDePiece({
  agencyId,
  type,
  dossier,
  libelleEnvoi,
  disposition,
  numeroInitial,
  aide,
  onEnvoyee,
}: {
  readonly agencyId: number;
  readonly type: TypeDePiece;
  readonly dossier: KycDossier;
  readonly libelleEnvoi: string;
  /** `encart` : le renouvellement de l'encart d'état (l'envoi d'abord, comme la maquette) ; `ligne` : dans la ligne de la pièce. */
  readonly disposition: 'encart' | 'ligne';
  readonly numeroInitial: string | null;
  readonly aide: string;
  readonly onEnvoyee?: () => void;
}) {
  const t = useTranslations('kyc.verification');
  const tExpiry = useTranslations('kyc.expiry');
  const toast = useToast();
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const id = useId();
  const photo = useRef<HTMLInputElement | null>(null);
  const fichier = useRef<HTMLInputElement | null>(null);
  const [choisi, setChoisi] = useState<File | null>(null);
  const [numero, setNumero] = useState(numeroInitial ?? '');
  const [echeance, setEcheance] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const exigeEcheance = type === 'director_id';
  const numerotee = PIECES_NUMEROTEES.includes(type);
  const libelle = t(`pieces.${type}`);
  const etaitVerifie = dossier.status === 'verified';

  const envoi = useMutation({
    mutationFn: (f: File) => uploadAgencyKycDocument(agencyId, type, f, exigeEcheance ? echeance : undefined, numerotee ? numero : undefined),
    onSuccess: async () => {
      setChoisi(null);
      setErreur(null);
      toast.add({ title: etaitVerifie ? t('envoi.reussiExamen') : t('envoi.reussi'), type: 'success' });
      onEnvoyee?.();
      await queryClient.invalidateQueries({ queryKey: agencyKycKey(agencyId) });
    },
    onError: (e) => setErreur(`${t('envoi.echec')} ${messageErreur(e)}`),
  });

  const choisir = (f: File | undefined) => {
    if (!f) return;
    if (f.size > PIECE_MAX_OCTETS) {
      setChoisi(null);
      setErreur(t('envoi.tropLourd', { max: PIECE_MAX_MO }));
      return;
    }
    setErreur(null);
    setChoisi(f);
  };

  const envoyer = () => {
    if (envoi.isPending) return;
    if (!choisi) return setErreur(t('envoi.fichierManquant'));
    if (exigeEcheance && !echeance) return setErreur(t('envoi.dateManquante'));
    envoi.mutate(choisi);
  };

  const boutonEnvoi = (
    <Button
      type="button"
      size="xl"
      className={cn(disposition === 'encart' ? 'w-full' : 'max-md:w-full')}
      aria-busy={envoi.isPending || undefined}
      aria-describedby={erreur ? `${id}-erreur` : undefined}
      onClick={envoyer}
    >
      {disposition === 'ligne' ? <Upload className="size-4" aria-hidden="true" /> : null}
      {envoi.isPending ? t('actions.envoiEnCours') : libelleEnvoi}
    </Button>
  );

  const champsFichiers = (
    <>
      {/* Deux vrais champs fichier, masqués : la caméra (`capture`) et le sélecteur. */}
      <input
        ref={photo}
        type="file"
        accept={ACCEPT_PHOTO}
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          choisir(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={fichier}
        type="file"
        accept={KYC_MIME_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          choisir(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {choisi ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-success/30 bg-success/10 px-3 py-2">
          <FileText className="size-icone flex-none text-success" strokeWidth={1.75} aria-hidden="true" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium">{choisi.name}</p>
            <p className="text-xs tabular-nums text-muted-foreground">{t('envoi.fichierChoisi', { taille: tailleLisible(choisi.size) })}</p>
          </div>
          <button type="button" className="flex-none text-sm font-medium text-primary hover:underline" onClick={() => fichier.current?.click()}>
            {t('actions.changer')}
          </button>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-auto min-h-11 min-w-0 whitespace-normal px-2 py-1"
          aria-label={t('actions.photoAria', { piece: libelle })}
          onClick={() => photo.current?.click()}
        >
          <Camera className="size-4 flex-none" aria-hidden="true" />
          <span className="text-center leading-tight">{t('actions.prendrePhoto')}</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-auto min-h-11 min-w-0 whitespace-normal px-2 py-1"
          aria-label={t('actions.fichierAria', { piece: libelle })}
          onClick={() => fichier.current?.click()}
        >
          <Upload className="size-4 flex-none" aria-hidden="true" />
          <span className="text-center leading-tight">{t('actions.choisirFichier')}</span>
        </Button>
      </div>
    </>
  );

  const champsDeLaPiece = (
    <>
      {numerotee ? (
        <div>
          <label htmlFor={`${id}-numero`} className="mb-1.5 block text-sm font-medium">
            {t(`numero.${type as 'rccm' | 'ninea'}`)}
          </label>
          <Input
            id={`${id}-numero`}
            value={numero}
            maxLength={50}
            aria-describedby={`${id}-numero-aide`}
            onChange={(e) => setNumero(e.target.value)}
          />
          <p id={`${id}-numero-aide`} className="mt-1 text-xs text-muted-foreground">
            {t('numero.aide')}
          </p>
        </div>
      ) : null}
      {exigeEcheance ? (
        <div>
          <span className="mb-1.5 block text-sm font-medium" aria-hidden="true">
            {tExpiry('fieldLabel')}
          </span>
          <DatePicker
            value={echeance}
            min={demainIso()}
            onValueChange={setEcheance}
            aria-label={tExpiry('fieldAria', { document: libelle })}
            aria-describedby={`${id}-echeance-aide`}
            buttonClassName="h-11 w-full"
          />
          <p id={`${id}-echeance-aide`} className="mt-1 text-xs text-muted-foreground">
            {tExpiry('fieldHint')}
          </p>
        </div>
      ) : null}
    </>
  );

  const message = erreur ? (
    <p id={`${id}-erreur`} role="alert" className="text-sm font-medium text-destructive">
      {erreur}
    </p>
  ) : null;

  // L'encart du renouvellement suit la maquette : l'envoi d'abord, puis photo · fichier, puis la date.
  if (disposition === 'encart') {
    return (
      <div className="mt-4 space-y-2">
        {boutonEnvoi}
        {message}
        {champsFichiers}
        <div className="pt-1">{champsDeLaPiece}</div>
        <p className="pt-0.5 text-xs text-muted-foreground">{aide}</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {champsFichiers}
      <p className="text-xs text-muted-foreground">{aide}</p>
      {champsDeLaPiece}
      {boutonEnvoi}
      {message}
    </div>
  );
}

function tailleLisible(octets: number): string {
  const mo = octets / (1024 * 1024);
  return mo >= 1 ? `${mo.toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(octets / 1024))} Ko`;
}

/* ── L'historique ── */

function useEvenements(dossier: KycDossier) {
  const t = useTranslations('kyc.verification.historique');
  const fmt = useFormatteurs();
  const evenements = historiqueDuDossier(dossier);
  return { t, fmt, evenements };
}

function HistoriqueReplie({ dossier, className }: { readonly dossier: KycDossier; readonly className?: string }) {
  const { t, fmt, evenements } = useEvenements(dossier);
  if (evenements.length === 0) return null;
  const dernier = evenements[0];
  return (
    <details className={cn('group rounded-xl border border-border bg-card', className)}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
        <History className="size-icone flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
        <span className="min-w-0 flex-1 text-corps font-medium">{t('titre')}</span>
        <span className="text-ui text-muted-foreground">{t(`resume.${dernier.cle}`, { date: fmt.date(dernier.date) })}</span>
        <ChevronDown className="size-5 flex-none text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <ListeDEvenements evenements={evenements} />
    </details>
  );
}

function HistoriqueEnColonne({ dossier, className }: { readonly dossier: KycDossier; readonly className?: string }) {
  const { t, evenements } = useEvenements(dossier);
  if (evenements.length === 0) return null;
  return (
    <section aria-label={t('titre')} className={cn('rounded-xl border border-border bg-card', className)}>
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-corps font-semibold">{t('titre')}</h3>
      </div>
      <ListeDEvenements evenements={evenements} />
    </section>
  );
}

function ListeDEvenements({ evenements }: { readonly evenements: ReturnType<typeof historiqueDuDossier> }) {
  const t = useTranslations('kyc.verification.historique');
  const fmt = useFormatteurs();
  return (
    <ol className="space-y-4 p-4">
      {evenements.map((e, i) => (
        <li key={`${e.cle}-${e.date}`} className="flex gap-3">
          <span
            className={cn(
              'mt-1.5 size-2.5 flex-none rounded-full',
              i === 0 && (e.cle === 'expire' || e.cle === 'refuse') ? 'bg-destructive' : 'bg-border',
            )}
            aria-hidden="true"
          />
          <div className="min-w-0 text-sm leading-tight">
            <p className="text-xs tabular-nums text-muted-foreground">{fmt.date(e.date)}</p>
            <p className="mt-0.5 font-medium">{t(`evenement.${e.cle}`)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
