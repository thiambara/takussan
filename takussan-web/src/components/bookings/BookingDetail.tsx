'use client';

// TCK-2878 — le nom d'un garant, par la règle du nom affichable.
import { nomAffichable } from '@/lib/identite';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Check, FileSignature, Plus, RotateCcw, XCircle } from 'lucide-react';
import {
  useBooking,
  useCancelBooking,
  useConfirmBooking,
  useCreateBookingPayment,
  useRejectBooking,
} from '@/lib/queries/bookings';
import { ErrorState } from '@/components/feedback';
import { ApiError } from '@/lib/api';
import { PageHeader, StatusBadge } from '@/components/console';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { RetenirLaFiche } from '@/components/layout/RetenirLaFiche';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { useCanAll } from '@/hooks/useCan';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { useMinuteCourante } from '@/hooks/useMinuteCourante';
import { usePersonnelActif } from '@/hooks/usePersonnelActif';
import { isAgent, isAdmin, isOwner } from '@/lib/roles';
import { clientPeutAnnuler, contreOffreARepondre } from '@/lib/reservations/appel-du-client';
import { useFormatteurs, type Formatteurs } from '@/lib/format/useFormatteurs';
import { montantDansLaNature, nuitsEntre } from '@/lib/reservations/liste-des-reservations';
import { cn } from '@/lib/utils';
// TCK-2963 — l'entrée dans la salle de la réservation (le candidat et le contact principal du bien).
import { BlocDeLaSalle } from '@/components/messages/salle/BlocDeLaSalle';
import type { Locale } from '@/i18n/config';
import type { Booking, BookingPayment } from '@/types/booking';
import { BOOKING_PAYMENT_STATUS_TONE } from './booking-status';
import { BookingPaymentDialog } from './BookingPaymentDialog';
import { BookingRefundDialog, BookingRefundPanel, paiementsRemboursables } from './BookingRefundPanel';
// TCK-2877 — les nuits du bien autour du séjour, au bureau.
import { NuitsDuBien } from './detail/nuits-du-bien';
import { FeuilleDeDecision } from './feuilles/FeuilleDeDecision';
import { PayOnlineButton } from '@/components/payments/PayOnlineButton';
import { PAYMENT_METHOD_VALUES } from '@/components/payments/constants';
import { BoutonTelechargement } from '@/components/documents/BoutonTelechargement';
import { usePaymentProviders } from '@/hooks/usePaymentProviders';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { LeaveReviewCta } from '@/components/reviews/LeaveReviewCta';
import { canBookingLeaveReview } from '@/components/reviews/reviewEligibility';
import type { GatewayProvider } from '@/hooks/useInitiatePayment';
import { ecartEnClair, StatutDeLaDemande, useAgeDeLaDemande, useBienEtQuartier, useNomDuClient } from './liste/pieces';
import {
  BienDeLaDemande,
  BlocQui,
  CarteDuBureau,
  Citation,
  ComparaisonDeLOffre,
  DatesDuSejour,
  JaugeDEncaissement,
  LigneCle,
  LigneDePaiement,
  RangeeDeGeste,
  SectionDuTelephone,
  SuiteDuBail,
} from './detail/pieces-du-detail';
import { AutresCandidatures, Completude, PiecesDuDossier, useSyntheseDeLaCandidature } from './detail/dossier';
import { HistoriqueDeLaFiche, type EvenementDeLHistorique } from './detail/historique';
// TCK-2876 — la contre-offre, le financement et la feuille « Contre-proposer ».
import { ContreOffreEnCours, contreOffreEnCours, useEvenementsDeLaContreOffre, useLibelleDuFinancement } from './detail/contre-offre';
import { FeuilleDeContreOffre } from './feuilles/FeuilleDeContreOffre';
import { ReponseALaContreOffre } from './liste/contre-offre-du-client';
import { useAncreDeLaFiche } from './detail/useAncreDeLaFiche';
// TCK-2878 — la candidature arrive (origine, réponse attendue, le fil du client), puis le bail repris.
import { BandeauAcceptee, BandeauDOrigine, EtapeDuClient, FilDeLaCandidature, useDepotEnClair } from './detail/candidature-et-bail';
import { GarantsDeLaCandidature } from './detail/garants';
import { PanneauDuBailRepris } from './feuilles/PanneauDuBailRepris';
import { heuresAvantLaReponse } from '@/lib/reservations/candidature';

/**
 * Listes figées hors composant : `useCanAll` mémoïse sur la RÉFÉRENCE du
 * tableau. Un littéral inline en recréerait une à chaque rendu et
 * recalculerait le verdict à chaque fois.
 */
const CAPABILITY_VALIDATE = ['bookings.validate'] as const;
const CAPABILITY_CANCEL = ['bookings.cancel'] as const;
const CAPABILITY_RECORD_PAYMENT = ['payments.record'] as const;
const CAPABILITY_CREATE_LEASE = ['leases.create'] as const;

/** Le téléphone : la coque de `/app` change de forme sous `md` (48 rem). */
const REQUETE_TELEPHONE = '(width < 48rem)';

/**
 * TCK-292 — les tables ci-dessous transportent la CLÉ (relative au namespace `bookings`), le
 * rendu la résout. Le statut de réservation vit dans `booking-status.ts`, partagé avec la liste.
 */
const PAYMENT_TYPE_LABEL_KEY: Record<string, string> = {
  deposit: 'paymentType.deposit',
  advance: 'paymentType.advance',
  fee: 'paymentType.fee',
  // TCK-2892
  security_deposit: 'paymentType.security_deposit',
  other: 'paymentType.other',
};

const PAYMENT_STATUS_LABEL_KEY: Record<string, string> = {
  pending: 'paymentStatus.pending',
  paid: 'paymentStatus.paid',
  late: 'paymentStatus.late',
  partially_paid: 'paymentStatus.partially_paid',
  failed: 'paymentStatus.failed',
  refunded: 'paymentStatus.refunded',
  cancelled: 'paymentStatus.cancelled',
};

/**
 * TCK-2594 — le moyen de paiement EN CLAIR (« Orange Money », jamais `orange_money`) : les huit cas de
 * l'enum `PaymentMethod` de l'API, libellés sous `payments.methods.*` comme partout ailleurs.
 */
export function estUnMoyenConnu(m: string | null | undefined): m is (typeof PAYMENT_METHOD_VALUES)[number] {
  return !!m && (PAYMENT_METHOD_VALUES as readonly string[]).includes(m);
}

type Nature = 'stay' | 'application' | 'offer' | 'autre';

/** « Ousmane » → élision devant une voyelle : « Candidature d’Ousmane Ba ». */
function elision(nom: string): 'oui' | 'non' {
  return /^[aeiouyàâäéèêëîïôöùûüœ]/i.test(nom.trim()) ? 'oui' : 'non';
}

function capitaliser(texte: string): string {
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/** « Mar. 10 nov. · 08:52 » : un instant de l'historique. */
function instantEnClair(f: Formatteurs, valeur: string): string {
  return `${capitaliser(f.date(valeur, { dateStyle: undefined, weekday: 'short', day: 'numeric', month: 'short' }))} · ${f.heure(valeur)}`;
}

/** « Jeu. 12 nov. » : un jour. */
function jourEnClair(f: Formatteurs, valeur: string, annee = false): string {
  return capitaliser(f.date(valeur, { dateStyle: undefined, weekday: 'short', day: 'numeric', month: 'short', ...(annee ? { year: 'numeric' } : {}) }));
}

interface BookingDetailProps {
  readonly bookingId: number;
}

export function BookingDetail({ bookingId }: BookingDetailProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('bookings.detail');
  const tBookings = useTranslations('bookings');
  const tFiche = useTranslations('bookings.fiche');
  const tNatures = useTranslations('bookings.liste.natures');
  const tConsole = useTranslations('console.pageHeader');
  const tPages = useTranslations('dashboard.pages.bookings');
  const tPayments = useTranslations('payments');
  const tCommon = useTranslations('common');
  const f = useFormatteurs();
  const maintenant = useMinuteCourante();
  const age = useAgeDeLaDemande(maintenant);
  const bienEtQuartier = useBienEtQuartier();
  const nomDuClient = useNomDuClient();
  const telephone = useMatchesMedia(REQUETE_TELEPHONE);
  const syntheseDe = useSyntheseDeLaCandidature();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [action, setAction] = useState<'confirm' | 'reject' | 'cancel' | null>(null);
  // TCK-2876 — la feuille « Contre-proposer », montée seulement ouverte (elle porte sa mutation).
  const [contreOffreOuverte, setContreOffreOuverte] = useState(false);
  // TCK-2877 — la feuille « Rembourser » d'un séjour confirmé.
  const [remboursementOuvert, setRemboursementOuvert] = useState(false);
  // TCK-2878 — le panneau « Nouveau bail · repris de la candidature » (bureau), monté ouvert seulement.
  const [bailOuvert, setBailOuvert] = useState(false);
  const depotEnClair = useDepotEnClair();
  const libelleDuFinancement = useLibelleDuFinancement();
  const evenementsDeLaContreOffre = useEvenementsDeLaContreOffre();
  const bookingQuery = useBooking(bookingId);
  const { data, isLoading, isError } = bookingQuery;
  // TCK-2879 — `#dossier` et `#paiement` (les gestes de la carte du client) : la section n'existe qu'une
  // fois la réservation lue ; on y descend alors.
  useAncreDeLaFiche(Boolean(data));
  const { user } = useAuth();
  // TCK-602 — lus sur le premier paiement en attente : agence et devise sont celles de la réservation.
  const { providers } = usePaymentProviders(
    'booking-payments',
    data?.data?.booking_payments?.find((p) => p.status === 'pending')?.id ?? null,
  );
  const cancelBooking = useCancelBooking(bookingId);
  const confirmBooking = useConfirmBooking(bookingId);
  const rejectBooking = useRejectBooking(bookingId);
  /**
   * TCK-279 (AC12) — « suis-je du côté tableau de bord ? » reste un test
   * d'APPARTENANCE : il pilote l'affichage (colonne agent contre colonne
   * client, invitation à laisser un avis), pas un verbe. Il garde donc
   * `isAgent`/`isAdmin`/`isOwner`, comme le prescrit le docblock de
   * `useCan`.
   */
  const isDashboardAgent = user ? isAgent(user.roles) || isAdmin(user.roles) || isOwner(user.roles) : false;
  /** TCK-2594 — la fiche du client (« Fiche ») : au seul personnel actif de l'agence de la réservation. */
  const personnel = usePersonnelActif(data?.data?.agency_id ?? null);
  /**
   * Les GESTES, eux, sont gardés par capacité. Un `agency_admin` dont
   * l'`AgencyRole` n'a pas `bookings.validate` voyait « Accepter » et
   * récoltait un 403 : depuis TCK-279, deux administrateurs de la même
   * agence peuvent porter des rôles différents, et le type de profil ne dit
   * plus ce qu'on a le droit de faire.
   *
   * ⚠️ Ceci n'autorise rien — `BookingPolicy` décide. Un bouton caché n'est
   * pas une sécurité, c'est une politesse.
   *
   * Plusieurs appels de hook, UNE requête réseau : ils partagent la clé
   * `['me','capabilities','active']`, donc TanStack Query n'en émet qu'une.
   *
   * `enabled: isDashboardAgent` — cet écran sert aussi les CLIENTS, qui
   * n'ont aucune de ces capacités et pour qui la question ne se pose pas.
   */
  const { can: canValidateBookings, isLoading: capabilitiesLoading } = useCanAll(
    CAPABILITY_VALIDATE,
    { enabled: isDashboardAgent },
  );
  const { can: canCancelBookings } = useCanAll(CAPABILITY_CANCEL, {
    enabled: isDashboardAgent,
  });
  const { can: canRecordPayments } = useCanAll(CAPABILITY_RECORD_PAYMENT, {
    enabled: isDashboardAgent,
  });
  const { can: canCreateLeases } = useCanAll(CAPABILITY_CREATE_LEASE, {
    enabled: isDashboardAgent,
  });
  const toast = useToast();

  if (isLoading) {
    return <Skeleton className="h-48 rounded-xl" />;
  }

  if (isError || !data) {
    // Un 403 n'est pas une panne : « réessayer » n'y changerait rien.
    const forbidden = bookingQuery.error instanceof ApiError && bookingQuery.error.status === 403;
    // Le seul titre de la page est celui de la réservation : l'écran d'erreur garde un h1.
    return (
      <>
        <h1 className="sr-only">{tBookings('fallbackTitle', { id: String(bookingId) })}</h1>
        {forbidden ? (
          <ErrorState message={t('forbidden')} />
        ) : (
          <ErrorState
            message={t('error')}
            onRetry={() => void bookingQuery.refetch()}
            retryLabel={tCommon('actions.retry')}
          />
        )}
      </>
    );
  }

  const booking = data.data;
  const isCustomer =
    !!user?.id && !!booking.customer && user.id === booking.customer.user_id;
  // Tant que les capacités n'ont pas répondu, `can` vaut `false` : rendre le
  // bouton sur cette seule base le ferait DISPARAÎTRE puis réapparaître. On
  // laisse donc l'ancien verdict d'appartenance tenir pendant le chargement,
  // puis la capacité prend la main. Le serveur reste seul juge dans les deux
  // cas.
  const staffMay = (granted: boolean) =>
    isDashboardAgent && (capabilitiesLoading ? true : granted);

  // TCK-1301 (P115.01) — un séjour confirmé dont le premier jour est arrivé ne
  // s'annule plus : l'API le refuse (`booking.cannot_cancel`). Le premier jour se juge sur le
  // jour de l'API, en UTC, pas sur celui du navigateur (P212.02). TCK-2879 — la règle est partagée
  // avec la carte de « Mes réservations » (`clientPeutAnnuler`).
  const canCancel = (isCustomer || staffMay(canCancelBookings)) && clientPeutAnnuler(booking);
  const canConfirm = staffMay(canValidateBookings) && booking.status === 'pending';
  const canReject = staffMay(canValidateBookings) && booking.status === 'pending';
  // TCK-2876 (ADR-0110 § 5) — « Contre-proposer » : une OFFRE en attente, sous la capacité
  // d'Accepter, au seul personnel de l'agence (`BookingPolicy::proposeCounterOffer` refuse le bailleur).
  const canCounterOffer = canConfirm && booking.kind === 'offer' && personnel && !isCustomer;
  const canRegisterPayment = staffMay(canRecordPayments);
  // P48.03 (TCK-2352) — la candidature acceptée d'un bien à louer mène au bail prérempli. L'API
  // vérifie que le locataire est le client de la réservation, et la passe à `completed`.
  // TCK-2594 — une CANDIDATURE seulement : un séjour confirmé d'un bien à louer ne mène pas au bail.
  const canCreateLease =
    staffMay(canCreateLeases) &&
    booking.kind === 'application' &&
    booking.status === 'confirmed' &&
    booking.property?.contract_type === 'rent';

  /* ─────────────────────────────── Les mots de la réservation ─────────────────────────────── */

  const nature: Nature = booking.kind ?? 'autre';
  const devise = booking.currency ?? booking.property?.currency ?? 'XOF';
  const montant = (v: number | null | undefined) => f.montantCourt(v, devise);
  const nom = nomDuClient(booking);
  const prenom = booking.customer?.first_name?.trim() || nom;
  const titreDuBien = bienEtQuartier(booking);
  const m = montantDansLaNature(booking);
  const etat = (() => {
    if (booking.status === 'confirmed') {
      const le = booking.confirmed_at ?? booking.confirmation_date;
      if (le) {
        const memeJour = f.date(le, { dateStyle: 'short' }) === f.date(maintenant, { dateStyle: 'short' });
        // Dans la phrase, le jour reste en minuscule : « acceptée mer. 11 nov. ».
        const quand = memeJour ? tFiche('quand.aHeure', { heure: f.heure(le) }) : f.date(le, { dateStyle: undefined, weekday: 'short', day: 'numeric', month: 'short' });
        return tFiche('etat.confirmee', { nature, quand });
      }
    }
    const recue = booking.created_at ?? booking.booking_date;
    return recue ? tFiche('etat.recue', { age: age(recue) }) : null;
  })();
  /**
   * TCK-2878 — « réponse attendue sous 35 h » : l'échéance RÉELLE (`response_deadline`) dite en heures
   * restantes (en jours au-delà de 72 h), à la place de la ligne « Expire le » d'une candidature.
   */
  const heuresRestantes = nature === 'application' ? heuresAvantLaReponse(booking, maintenant) : null;
  const reponseAttendue =
    heuresRestantes === null
      ? null
      : heuresRestantes === 0
        ? tFiche('reponse.depassee')
        : heuresRestantes <= 72
          ? tFiche('reponse.heures', { n: heuresRestantes })
          : tFiche('reponse.jours', { n: Math.ceil(heuresRestantes / 24) });
  const ligneDeTete = [tFiche(`natureCourte.${nature}`), etat, reponseAttendue].filter(Boolean).join(' · ');
  const prixDuBien = booking.property?.price ?? null;
  const affiche =
    prixDuBien === null
      ? null
      : nature === 'stay'
        ? tFiche('affiche.sejour', { prix: montant(prixDuBien) })
        : booking.property?.contract_type === 'rent'
          ? tFiche('affiche.location', { prix: montant(prixDuBien) })
          : booking.property?.contract_type === 'sale'
            ? tFiche('affiche.vente', { prix: montant(prixDuBien) })
            : null;
  const lienDuBien = booking.property
    ? isDashboardAgent
      ? { href: `/app/properties/${booking.property.id}`, publique: false }
      : booking.property.slug
        ? { href: `/properties/${booking.property.slug}`, publique: true }
        : null
    : null;
  const titre = tFiche('titre', { nature, elision: elision(nom), nom });
  const titreDeLEnTete = tFiche(`enTete.${nature}`);
  const versLaListe = nature === 'autre' ? '/app/bookings' : `/app/bookings?kind=${nature}`;
  const messageWhatsApp = tFiche('qui.messageWhatsApp', {
    prenom,
    nature,
    bien: booking.property?.title ?? titreDuBien,
  });
  const paiements = booking.booking_payments ?? [];
  // TCK-2877 (TCK-2892) — une caution ou un paiement « autre » ne règle pas le séjour : hors de l'encaissé.
  const encaisse = paiements.filter(regleLeTotal).reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const acompte = acomptePaye(booking);
  /** TCK-2594 — ce qui reste à encaisser : le montant prérempli de « Enregistrer un paiement ». */
  const totalDu = m.forme === 'nuits' && m.montant !== null ? m.montant : Number(booking.total_amount ?? 0);
  const resteAEncaisser = totalDu > encaisse ? totalDu - encaisse : null;

  /** « Expire le » : une demande EN ATTENTE seulement (l'audit le relevait sur une confirmée). */
  const expireLe = booking.status === 'pending' ? (nature === 'offer' ? (booking.offer_expires_at ?? booking.expires_at) : booking.expires_at) : null;

  /* ───────────────────────────────────── Les blocs ───────────────────────────────────── */

  const bien = (
    <BienDeLaDemande
      titre={titreDuBien}
      photo={booking.property?.main_photo_url}
      affiche={affiche}
      lien={lienDuBien}
    />
  );

  /**
   * TCK-2876 — « En vente depuis 47 jours · 6 visites · première offre reçue. » Les visites du bien
   * (tous visiteurs) et le rang de l'offre ne sont servis qu'au personnel : absents, ils se taisent.
   */
  const faitsDuBien =
    nature === 'offer'
      ? [
          booking.property?.published_at ? tFiche('offre.enVenteDepuis', { n: joursDepuis(booking.property.published_at, maintenant) }) : null,
          booking.property_visits_count != null ? tFiche('offre.visites', { n: booking.property_visits_count }) : null,
          booking.offer_rank ? tFiche('offre.rang', { premiere: booking.offer_rank === 1 ? 'oui' : 'non', rang: booking.offer_rank }) : null,
        ].filter((x): x is string => x !== null)
      : [];

  const comparaison =
    nature === 'offer' && m.forme === 'offre' ? (
      <>
        <ComparaisonDeLOffre
          offre={montant(m.montant)}
          affiche={m.affiche !== null ? montant(m.affiche) : null}
          ecartMontant={m.affiche !== null && m.montant !== null ? ecartEnClair(signe(m.montant - m.affiche, montant)) : null}
          ecartPourcentage={m.ecart !== null ? ecartEnClair(f.pourcentage(m.ecart, { maximumFractionDigits: 1, signDisplay: 'exceptZero' })) : null}
          part={m.affiche && m.montant !== null ? m.montant / m.affiche : null}
        />
        {/* TCK-2876 — les faits du bien sous la comparaison. */}
        {faitsDuBien.length > 0 ? <p className="mt-2 text-ui text-muted-foreground">{tFiche('offre.faits', { faits: faitsDuBien.join(' · ') })}</p> : null}
      </>
    ) : null;

  const dates =
    nature === 'stay' && booking.start_date && booking.end_date ? (
      <DatesDuSejour
        arrivee={jourEnClair(f, booking.start_date)}
        depart={jourEnClair(f, booking.end_date)}
        nuits={nuitsEntre(booking.start_date, booking.end_date)}
        // TCK-2877 — les heures du bien (14:00 / 11:00 s'il ne les dit pas) et les voyageurs.
        heureDArrivee={booking.property?.check_in_from}
        heureDeDepart={booking.property?.check_out_before}
        voyageurs={booking.guests}
      />
    ) : null;

  const montantDuSejour = (() => {
    if (nature !== 'stay' || m.forme !== 'nuits' || m.montant === null) return null;
    const parNuit = booking.price_at_booking ?? Math.round(m.montant / m.nuits);
    const depot = booking.deposit_amount ?? null;
    return (
      <>
        <dl className="divide-y divide-border">
          <LigneCle cle={tFiche('sejour.nuitsFois', { n: m.nuits, prix: montant(parNuit) })}>
            <span className="tabular-nums">{montant(m.montant)}</span>
          </LigneCle>
          {depot ? (
            <LigneCle cle={tFiche('sejour.acompte', { pourcentage: f.pourcentage(depot / m.montant) })}>
              <span className="tabular-nums">{montant(depot)}</span>
              {acompte ? <span className="text-success"> {tFiche('quoi.paye')}</span> : null}
            </LigneCle>
          ) : null}
          {encaisse < m.montant ? (
            <LigneCle cle={tFiche('sejour.solde')}>
              <span className="tabular-nums">{montant(m.montant - encaisse)}</span>{' '}
              <span className="font-normal text-muted-foreground">{tFiche('sejour.aLArrivee')}</span>
            </LigneCle>
          ) : null}
        </dl>
        <JaugeDEncaissement part={encaisse / m.montant} legende={tFiche('sejour.recus', { recu: montant(encaisse), total: montant(m.montant) })} />
      </>
    );
  })();

  /** TCK-2875 — « 2 mois · 600 000 F » : la caution d'une candidature, en mois de loyer et en montant. */
  const caution = [
    booking.security_deposit_months != null ? tFiche('quoi.cautionMois', { n: booking.security_deposit_months }) : null,
    booking.security_deposit_amount != null ? montant(booking.security_deposit_amount) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // TCK-2876 — le financement en clair, la contre-offre ouverte (au seul personnel : la réponse du client est TCK-2879).
  const financement = libelleDuFinancement(booking.financing);
  const contreOffre = isCustomer ? null : contreOffreEnCours(booking);
  const enTeteDuQuoi = contreOffre ? <ContreOffreEnCours co={contreOffre} prenom={prenom} montant={montant(contreOffre.amount)} f={f} /> : null;

  /** QUOI : dans les mots de la nature, puis ce que toute demande porte (acompte, échéance, référence). */
  const lignesDuQuoi = (
    <dl className="divide-y divide-border">
      {nature === 'application' && m.montant !== null ? (
        <LigneCle cle={tFiche('quoi.loyerPropose')}>
          <span className="tabular-nums">{tFiche('quoi.loyer', { montant: montant(m.montant) })}</span>
          {prixDuBien !== null && prixDuBien === m.montant ? <span className="font-normal text-muted-foreground"> {tFiche('quoi.lePrixAffiche')}</span> : null}
        </LigneCle>
      ) : null}
      {nature === 'application' && booking.start_date ? <LigneCle cle={tFiche('quoi.entree')}>{jourEnClair(f, booking.start_date, true)}</LigneCle> : null}
      {/* TCK-2875 (ADR-0110 § 1) — la durée, la caution et ce qui est à verser à l'entrée (dérivé par l'API). */}
      {nature === 'application' && booking.term_months ? (
        <LigneCle cle={tFiche('quoi.duree')}>{tFiche('quoi.dureeValeur', { n: booking.term_months, renouvelable: booking.renewable ? 'oui' : 'non' })}</LigneCle>
      ) : null}
      {nature === 'application' && caution ? <LigneCle cle={tFiche('quoi.caution')}>{caution}</LigneCle> : null}
      {nature === 'application' && booking.entry_amount != null ? (
        <LigneCle cle={tFiche('quoi.aVerser')}>
          <span className="tabular-nums">{montant(booking.entry_amount)}</span>
        </LigneCle>
      ) : null}
      {nature === 'autre' ? (
        <>
          {booking.start_date && booking.end_date ? (
            <LigneCle cle={t('dates')}>
              <span className="tabular-nums">
                {f.date(booking.start_date)} → {f.date(booking.end_date)}
              </span>
            </LigneCle>
          ) : null}
          <LigneCle cle={t('total')}>
            <span className="tabular-nums">{montant(booking.total_amount)}</span>
          </LigneCle>
        </>
      ) : null}
      {/* TCK-2876 (ADR-0110 § 1) — comment l'acheteur paie, en combien de temps il signe, sous quelles conditions. */}
      {nature === 'offer' && financement ? <LigneCle cle={tFiche('quoi.financement')}>{financement}</LigneCle> : null}
      {nature === 'offer' && booking.signature_within_days ? (
        <LigneCle cle={tFiche('quoi.delaiDeSignature')}>{tFiche('quoi.jours', { n: booking.signature_within_days })}</LigneCle>
      ) : null}
      {nature === 'offer' && booking.conditions?.trim() ? <LigneCle cle={tFiche('quoi.conditions')}>{booking.conditions.trim()}</LigneCle> : null}
      {nature !== 'stay' && booking.deposit_amount ? (
        <LigneCle cle={tFiche('quoi.acompte')}>
          <span className="tabular-nums">{montant(booking.deposit_amount)}</span>
          {acompte ? <span className="text-success"> {tFiche('quoi.paye')}</span> : null}
        </LigneCle>
      ) : null}
      {/* TCK-2878 — une candidature dit sa réponse attendue en tête, plus « Expire le ». */}
      {expireLe && !reponseAttendue ? (
        <LigneCle cle={nature === 'offer' ? tFiche('quoi.valable') : t('expiresAt')}>{jourEnClair(f, expireLe, true)}</LigneCle>
      ) : null}
      {/* Au bureau, la référence est dans le sous-titre de l'en-tête. */}
      {telephone && booking.reference_number ? (
        <LigneCle cle={tFiche('quoi.reference')}>
          <span className="tabular-nums">{booking.reference_number}</span>
        </LigneCle>
      ) : null}
    </dl>
  );
  const message = booking.notes ? <Citation>{booking.notes}</Citation> : null;

  const suiteDuBail =
    nature === 'application' && booking.status === 'confirmed' ? (
      <SuiteDuBail
        lignes={[
          { cle: tFiche('suiteBail.locataire'), valeur: nom },
          { cle: tFiche('suiteBail.bien'), valeur: titreDuBien },
          ...(m.montant !== null ? [{ cle: tFiche('suiteBail.loyer'), valeur: tFiche('quoi.loyer', { montant: montant(m.montant) }) }] : []),
          // TCK-2875 — la caution que le bail reprend (TCK-2894).
          ...(booking.security_deposit_amount != null ? [{ cle: tFiche('suiteBail.caution'), valeur: montant(booking.security_deposit_amount) }] : []),
          // TCK-2878 — « 1ᵉʳ déc. 2026 · 12 mois » (maquette e7) : le début et la durée de la candidature.
          ...(booking.start_date
            ? [
                {
                  cle: tFiche('suiteBail.debut'),
                  valeur: [
                    f.date(booking.start_date, { dateStyle: undefined, day: 'numeric', month: 'short', year: 'numeric' }),
                    booking.term_months ? tFiche('quoi.dureeValeur', { n: booking.term_months, renouvelable: 'non' }) : null,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                },
              ]
            : []),
          // TCK-2878 — le garant que le bail reprend (TCK-2894).
          ...((booking.guarantors?.length ?? 0) > 0
            ? [{ cle: tFiche('suiteBail.garant'), valeur: (booking.guarantors ?? []).map((g) => nomAffichable(g)).join(', ') }]
            : []),
        ]}
      />
    ) : null;

  const qui = isCustomer ? null : (
    <BlocQui b={booking} ficheHref={personnel && booking.customer_id ? `/app/customers/${booking.customer_id}` : null} messageWhatsApp={messageWhatsApp} large={!telephone} />
  );

  const listeDesPaiements =
    paiements.length > 0 ? (
      <ul className="divide-y divide-border">
        {paiements.map((p) => (
          <LigneDePaiement
            key={p.id}
            paye={p.status === 'paid'}
            titre={tFiche('paiement.ligne', {
              type: PAYMENT_TYPE_LABEL_KEY[p.payment_type] ? tBookings(PAYMENT_TYPE_LABEL_KEY[p.payment_type]) : p.payment_type,
              montant: f.montantCourt(p.amount, p.currency ?? devise),
            })}
            detail={[
              p.payment_method ? (estUnMoyenConnu(p.payment_method) ? tPayments(`methods.${p.payment_method}`) : p.payment_method) : null,
              p.payment_date ?? p.created_at ? `${f.jourMois(p.payment_date ?? p.created_at, maintenant)} ${f.heure(p.payment_date ?? p.created_at)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            reference={p.transaction_id ? tFiche('paiement.reference', { reference: p.transaction_id }) : null}
            geste={<GesteDuPaiement p={p} providers={providers} />}
          />
        ))}
      </ul>
    ) : (
      <p className="text-sm text-muted-foreground">{t('noPayments')}</p>
    );
  const avecPaiements = paiements.length > 0 || nature === 'stay' || nature === 'autre';

  const remboursement =
    booking.refund_status != null ? <BookingRefundPanel booking={booking} locale={locale} isCustomer={isCustomer} /> : null;

  const historique = (
    <HistoriqueDeLaFiche
      booking={booking}
      // TCK-2876 — la contre-offre (son envoi, sa réponse) entre à sa date ; au seul personnel (TCK-2879 pour le client).
      evenements={[...evenementsDeLHistorique(booking, nature, nom, tFiche, t), ...(isCustomer ? [] : evenementsDeLaContreOffre(booking.counter_offer, montant))]}
      personnel={personnel} formater={(at) => instantEnClair(f, at)} />
  );

  /**
   * TCK-2875 (ADR-0110 § 2) — le dossier d'une candidature ou d'une offre : sa complétude, puis ses
   * pièces (lues seulement là, jamais par la liste). « Ouvrir » et « Demander » au seul personnel.
   */
  // Une CANDIDATURE seulement : l'offre (maquette « Offre ») n'a pas de dossier à l'écran — TCK-2876.
  const dossier = nature === 'application' && booking.dossier && booking.dossier.required > 0 ? booking.dossier : null;
  const completude = dossier ? <Completude recues={dossier.received} total={dossier.required} /> : null;
  // TCK-2878 — les garants d'une candidature ouverte, sous ses pièces, au seul personnel (le geste garant).
  const garantsDeLaCandidature =
    dossier && personnel && !isCustomer && booking.guarantors !== undefined && (booking.status === 'pending' || booking.status === 'confirmed') ? (
      <GarantsDeLaCandidature booking={booking} />
    ) : null;
  const piecesDuDossier = dossier ? (
    <>
      {/* TCK-2879 — le client dépose tant que la demande est ouverte (`booking.dossier_closed` sinon). */}
      <PiecesDuDossier bookingId={booking.id} personnel={personnel} client={isCustomer && (booking.status === 'pending' || booking.status === 'confirmed')} maintenant={maintenant} />
      {garantsDeLaCandidature}
    </>
  ) : null;

  /**
   * TCK-2878 (maquette `app-fil-commercial` e6/e7) — le dépôt et la suite d'une candidature, au
   * personnel : le bandeau du dépôt, l'acceptation et le passage de la fiche, le fil du client.
   */
  const candidatureDuPersonnel = nature === 'application' && personnel && !isCustomer && !!booking.customer_id;
  const acceptee = nature === 'application' && booking.status === 'confirmed';
  const bandeauDOrigine = candidatureDuPersonnel ? <BandeauDOrigine booking={booking} prenom={prenom} /> : null;
  const bandeauAcceptee = acceptee && !isCustomer ? <BandeauAcceptee booking={booking} prenom={prenom} /> : null;
  const etapeDuClient = acceptee && personnel && !isCustomer && booking.stage_change ? <EtapeDuClient booking={booking} maintenant={maintenant} /> : null;
  const filDuClient = (forme: 'carte' | 'section') =>
    candidatureDuPersonnel && (booking.status === 'pending' || booking.status === 'confirmed') ? (
      <FilDeLaCandidature booking={booking} prenom={prenom} forme={forme} />
    ) : null;

  // TCK-2879 — la contre-offre qui attend le client (où mène l'avis `counter_offer_received`) : sa réponse,
  // comme sur la carte de « Mes réservations ».
  const contreOffreDuClient = isCustomer ? contreOffreARepondre(booking) : null;
  // TCK-2879 — `#paiement` : « Payer l'acompte » et « Payer le solde » de la carte du client mènent ici. Avec un
  // paiement déjà en attente (le client revient de la passerelle), `CustomerPayCta` se tait et « Payer en ligne »
  // vit dans la section Paiements : l'ancre y passe.
  const ancreSurLesPaiements = isCustomer && avecPaiements && paiements.some((p) => p.status === 'pending');
  const avisEtPaiementDuClient = (
    <div id={ancreSurLesPaiements ? undefined : 'paiement'} className="scroll-mt-20 space-y-5 empty:hidden">
      {contreOffreDuClient ? (
        <ReponseALaContreOffre bookingId={booking.id} co={contreOffreDuClient} devise={devise} className="rounded-xl border border-border bg-card p-4 max-md:mx-4 max-md:my-4" />
      ) : null}
      {!isDashboardAgent && canBookingLeaveReview(booking) && booking.property?.slug && (
        <LeaveReviewCta slug={booking.property.slug} context={t('reviewContext')} propertyTitle={booking.property.title} />
      )}
      {isCustomer && (
        <CustomerPayCta
          bookingId={bookingId}
          booking={booking}
          // TCK-602 — l'appel n'existe qu'en l'absence de paiement en attente : aucun paiement
          // dont lire les fournisseurs. « Inconnu » ; l'initiation refuse en 422 un fournisseur
          // que l'agence n'a pas, avant tout appel sortant.
          providers={undefined}
        />
      )}
    </div>
  );

  /* ─────────────────────────────────── La suite ─────────────────────────────────── */

  const annuler = () => setAction('cancel');
  const libelleAnnuler = tFiche('gestes.annuler', { nature });
  const sejourAvecPaiement = nature === 'stay' && canRegisterPayment && booking.status === 'confirmed';
  /** TCK-2876 — « Contre-proposer », ou « Modifier la contre-offre » quand une contre-offre attend le client. */
  const libelleContreProposer = tFiche('contreOffre.geste', { modifier: contreOffre ? 'oui' : 'non' });
  // Au téléphone, trois gestes tiennent dans ~340 px : « Modifier la contre-offre » s'y dit « Modifier »
  // (le nom accessible garde le libellé entier, qui contient le mot visible).
  const boutonContreProposer = (variant: 'outline' | 'ghost', className?: string, court = false) => (
    <Button
      type="button"
      variant={variant}
      className={className}
      aria-label={court && contreOffre ? libelleContreProposer : undefined}
      onClick={() => setContreOffreOuverte(true)}
    >
      {court && contreOffre ? tFiche('contreOffre.gesteCourt') : libelleContreProposer}
    </Button>
  );
  /** Le geste principal : décider, créer le bail, ou encaisser un séjour. */
  const suite: ReactNode =
    canConfirm || canReject ? (
      <>
        {canReject ? (
          <Button type="button" variant="outline" onClick={() => setAction('reject')}>
            {t('actions.reject')}
          </Button>
        ) : null}
        {/* TCK-2876 — entre Refuser et Accepter (maquette e4), dans la barre comme dans l'en-tête. */}
        {canCounterOffer ? boutonContreProposer('outline', undefined, telephone) : null}
        {canConfirm ? (
          <Button type="button" onClick={() => setAction('confirm')}>
            {telephone ? null : <Check className="size-4" aria-hidden="true" />}
            {t('actions.accept')}
          </Button>
        ) : null}
      </>
    ) : canCreateLease ? (
      // TCK-2878 — au bureau, le panneau « Nouveau bail · repris de la candidature » ; au téléphone, le formulaire prérempli.
      telephone ? (
        <Link href={`/app/leases/new?booking_id=${booking.id}`} className={buttonVariants()}>
          <FileSignature className="size-4" aria-hidden="true" />
          {t('actions.createLease')}
        </Link>
      ) : (
        <Button type="button" onClick={() => setBailOuvert(true)}>
          <FileSignature className="size-4" aria-hidden="true" />
          {t('actions.createLease')}
        </Button>
      )
    ) : sejourAvecPaiement ? (
      <Button type="button" onClick={() => setPaymentOpen(true)}>
        <Plus className="size-4" aria-hidden="true" />
        {tBookings('paymentDialog.title')}
      </Button>
    ) : null;
  /** « Enregistrer un paiement » hors d'un séjour confirmé : un geste second. */
  const paiementSecond = canRegisterPayment && !sejourAvecPaiement;
  /**
   * TCK-2877 — « Rembourser » un séjour CONFIRMÉ sans attendre qu'il soit fermé (l'API rembourse
   * tout paiement `paid`, `BookingPaymentService::refund`) : sous `can_refund`, et s'il reste un
   * paiement encaissé pas entièrement rendu. Une réservation fermée garde son bloc (TCK-596).
   */
  const remboursables = paiementsRemboursables(booking);
  const canRefundStay = nature === 'stay' && booking.status === 'confirmed' && !isCustomer && booking.can_refund === true && remboursables.length > 0;
  const ouvrirLeRemboursement = () => setRemboursementOuvert(true);

  const dialogues = (
    <>
      <BookingPaymentDialog
        bookingId={bookingId}
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        restant={resteAEncaisser}
        typeParDefaut={acompte ? 'advance' : 'deposit'}
        devise={devise}
      />
      <FeuilleDeDecision
        action={action}
        nature={nature}
        prenom={prenom}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
        pending={confirmBooking.isPending || rejectBooking.isPending || cancelBooking.isPending}
        onSubmit={async ({ reason, reason_code, message }) => {
          if (action === 'confirm') {
            await confirmBooking.mutateAsync();
            toast.add({ title: t('toasts.accepted.title'), description: t('toasts.accepted.description'), type: 'success' });
          }
          if (action === 'reject') {
            // TCK-2877 — le motif codé et le message partent au client (TCK-2874).
            await rejectBooking.mutateAsync({ reason, ...(reason_code ? { reason_code } : {}), ...(message ? { message } : {}) });
            toast.add({ title: t('toasts.rejected.title'), description: t('toasts.rejected.description'), type: 'success' });
          }
          if (action === 'cancel') {
            await cancelBooking.mutateAsync({ reason });
            toast.add({ title: t('toasts.cancelled.title'), description: t('toasts.cancelled.description'), type: 'success' });
          }
          setAction(null);
        }}
      />
      {/* TCK-2876 — la feuille « Contre-proposer », montée ouverte seulement. */}
      {canCounterOffer && contreOffreOuverte ? (
        <FeuilleDeContreOffre
          bookingId={booking.id}
          open
          onOpenChange={setContreOffreOuverte}
          prixAffiche={m.forme === 'offre' && m.affiche !== null ? m.affiche : prixDuBien}
          enCours={contreOffre}
          devise={devise}
          maintenant={maintenant}
          onEnvoyee={() => toast.add({ title: tFiche('contreOffre.toast', { prenom }), type: 'success' })}
        />
      ) : null}
      {/* TCK-2877 — « Rembourser » d'un séjour confirmé, montée ouverte seulement. */}
      {/* TCK-2878 — le bail repris de la candidature, montée ouverte seulement. */}
      {canCreateLease && bailOuvert && !telephone ? (
        <PanneauDuBailRepris
          booking={booking}
          nom={nom}
          prenom={prenom}
          // Sans le prix affiché : le loyer du bail est celui de la candidature, pas le prix courant du bien.
          bien={<BienDeLaDemande titre={titreDuBien} photo={booking.property?.main_photo_url} affiche={null} lien={lienDuBien} />}
          onOpenChange={setBailOuvert}
        />
      ) : null}
      {canRefundStay && remboursementOuvert ? (
        <BookingRefundDialog booking={booking} paiements={remboursables} locale={locale} onClose={() => setRemboursementOuvert(false)} />
      ) : null}
    </>
  );

  /** Les gestes seconds : au téléphone sous « Autres gestes », au bureau dans une carte du même nom. */
  const gestes = [
    paiementSecond ? (
      <RangeeDeGeste
        key="paiement"
        icone={<Plus className="size-icone text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />}
        libelle={tBookings('paymentDialog.title')}
        onClick={() => setPaymentOpen(true)}
      />
    ) : null,
    // TCK-2877 — maquette e5 : « Rembourser » avant « Annuler le séjour ».
    canRefundStay ? (
      <RangeeDeGeste
        key="rembourser"
        icone={<RotateCcw className="size-icone text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />}
        libelle={tFiche('gestes.rembourser')}
        onClick={ouvrirLeRemboursement}
      />
    ) : null,
    canCancel ? (
      <RangeeDeGeste
        key="annuler"
        danger
        icone={<XCircle className="size-icone" strokeWidth={1.75} aria-hidden="true" />}
        libelle={libelleAnnuler}
        aide={tFiche('gestes.annulerAide', { nature, date: booking.start_date ? jourEnClair(f, booking.start_date) : '' })}
        onClick={annuler}
        disabled={cancelBooking.isPending}
      />
    ) : null,
  ].filter(Boolean);

  /* ─────────────────────────────────── Téléphone ─────────────────────────────────── */

  if (telephone) {
    return (
      <PagePleineLargeur data-slot="fiche-de-la-reservation" className="pb-6">
        <DeclarerEnTete forme="detail" titre={titreDeLEnTete} repli={versLaListe} />
        {/* TCK-2846 — au téléphone aussi : la fiche entre dans les récents sous son titre. */}
        <RetenirLaFiche type="reservation" id={booking.id} titre={titre} chemin={`/app/bookings/${booking.id}`} />
        <h1 className="sr-only">{titre}</h1>
        <div className="p-4">
          {/* TCK-2878 — maquette e6 : le bandeau du dépôt en tête. */}
          {bandeauDOrigine ? <div className="mb-4">{bandeauDOrigine}</div> : null}
          <div className="flex items-center gap-2">
            <StatutDeLaDemande statut={booking.status} />
            <span className="text-ui text-muted-foreground">{ligneDeTete}</span>
          </div>
          <div className="mt-3">{bien}</div>
        </div>
        {/* TCK-2963 — la salle de la réservation, sous l'en-tête : absente pour qui n'en est pas partie. */}
        <BlocDeLaSalle nature="booking" id={booking.id} className="mx-4 mb-4" />
        {/* TCK-2878 — maquette e7 : l'acceptation, puis le passage de la fiche en Négociation, avant le bail prêt. */}
        {bandeauAcceptee || etapeDuClient ? (
          <div className="space-y-4 px-4 pb-4">
            {bandeauAcceptee}
            {etapeDuClient}
          </div>
        ) : null}
        {suiteDuBail || comparaison || dates ? (
          <div className="px-4 pb-4">
            {suiteDuBail}
            {comparaison}
            {dates}
          </div>
        ) : null}
        {/* TCK-2878 — « De la demande au bail · N jours » : le fil du client sous le bail prêt. */}
        {acceptee ? filDuClient('section') : null}
        {montantDuSejour ? <SectionDuTelephone titre={tFiche('sections.montant')}>{montantDuSejour}</SectionDuTelephone> : null}
        {qui ? (
          <SectionDuTelephone titre={tFiche('sections.qui')}>
            {qui}
            {nature === 'stay' && message ? <div className="mt-3">{message}</div> : null}
          </SectionDuTelephone>
        ) : null}
        <SectionDuTelephone titre={tFiche('sections.quoi')}>
          {/* TCK-2876 — la contre-offre en cours, en tête du Quoi. */}
          {enTeteDuQuoi ? <div className="mb-3">{enTeteDuQuoi}</div> : null}
          {lignesDuQuoi}
          {(nature !== 'stay' || isCustomer) && message ? <div className="mt-3">{message}</div> : null}
        </SectionDuTelephone>
        {dossier ? (
          <SectionDuTelephone id="dossier" titre={tFiche('sections.dossier')} action={completude}>
            {piecesDuDossier}
          </SectionDuTelephone>
        ) : null}
        {avisEtPaiementDuClient}
        {avecPaiements ? (
          <SectionDuTelephone id={ancreSurLesPaiements ? 'paiement' : undefined} titre={tFiche('sections.paiements')} compte={paiements.length}>
            {listeDesPaiements}
          </SectionDuTelephone>
        ) : null}
        {remboursement ? <div className="border-t border-border px-4 py-4">{remboursement}</div> : null}
        {gestes.length > 0 ? (
          <SectionDuTelephone titre={tFiche('sections.autresGestes', { n: gestes.length })}>
            <div className="divide-y divide-border">{gestes}</div>
          </SectionDuTelephone>
        ) : null}
        <SectionDuTelephone titre={tFiche('sections.historique')}>{historique}</SectionDuTelephone>
        {/* Des boutons de 48 px, comme la maquette (`Bouton taille="grand"`). */}
        {/* TCK-2876 — trois gestes (maquette e4) : Refuser et Accepter à la largeur de leur libellé, Contre-proposer prend le reste. */}
        {suite ? (
          <BarreDAction taille="action" className={canCounterOffer ? '*:first:not-last:flex-none *:last:not-first:flex-none' : undefined}>
            {suite}
          </BarreDAction>
        ) : null}
        {dialogues}
      </PagePleineLargeur>
    );
  }

  /* ───────────────────────────────────── Bureau ───────────────────────────────────── */

  const decisionDeLOffre =
    nature === 'offer' && booking.status === 'pending' && m.forme === 'offre' && m.ecart !== null ? (
      <CarteDuBureau titre={tFiche('sections.decision')}>
        <p className={cn('p-4 text-sm leading-snug text-foreground', (canConfirm || canReject) && 'pb-0')}>
          {m.ecart < 0
            ? tFiche('decision.sous', { pourcentage: f.pourcentage(-m.ecart, { maximumFractionDigits: 1 }) })
            : m.ecart > 0
              ? tFiche('decision.dessus', { pourcentage: f.pourcentage(m.ecart, { maximumFractionDigits: 1 }) })
              : tFiche('decision.egale')}
          {expireLe ? ` ${tFiche('decision.jusquA', { date: jourEnClair(f, expireLe) })}` : null}
        </p>
        {/* La décision se prend aussi là où elle se lit (maquette « Offre ») : « Accepter » dit le
            montant qu'on accepte, « Refuser » reste discret. */}
        {canConfirm || canReject ? (
          <div data-slot="gestes-de-la-decision" className="mt-4 space-y-2 px-4 pb-4">
            {canConfirm && m.montant !== null ? (
              <Button type="button" className="w-full" onClick={() => setAction('confirm')}>
                {tFiche('decision.accepter', { montant: montant(m.montant) })}
              </Button>
            ) : null}
            {/* TCK-2876 — le 3ᵉ geste de la carte (maquette e4) : Accepter, Contre-proposer, Refuser. */}
            {canCounterOffer ? boutonContreProposer('outline', 'w-full') : null}
            {canReject ? (
              <Button type="button" variant="ghost" className="w-full" onClick={() => setAction('reject')}>
                {t('actions.reject')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </CarteDuBureau>
    ) : null;

  /**
   * TCK-2875 — la décision d'une CANDIDATURE à décider (maquette e1, à droite) : la synthèse dérivée,
   * « N autre(s) candidature(s) sur ce bien · Comparer », puis Refuser / Accepter. Jamais au candidat :
   * le dossier lui est servi, la synthèse de sa propre candidature ne lui est pas destinée.
   */
  const synthese = nature === 'application' && !isCustomer ? syntheseDe(booking) : null;
  const autresEnAttente = (booking.other_pending_on_property ?? 0) > 0;
  const decisionDeLaCandidature =
    nature === 'application' && booking.status === 'pending' && !isCustomer && (synthese || autresEnAttente || canConfirm || canReject) ? (
      <CarteDuBureau titre={tFiche('sections.decision')}>
        <div data-slot="decision-de-la-candidature" className="p-4">
          {synthese ? <p className="text-sm leading-snug text-foreground">{synthese}</p> : null}
          <AutresCandidatures b={booking} />
          {canConfirm || canReject ? (
            <div data-slot="gestes-de-la-decision" className={cn('grid grid-cols-2 gap-2', (synthese || autresEnAttente) && 'mt-4')}>
              {canReject ? (
                <Button type="button" variant="outline" className="w-full" onClick={() => setAction('reject')}>
                  {t('actions.reject')}
                </Button>
              ) : null}
              {canConfirm ? (
                <Button type="button" className={cn('w-full', !canReject && 'col-span-2')} onClick={() => setAction('confirm')}>
                  {t('actions.accept')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </CarteDuBureau>
    ) : null;

  const carteDossier = dossier ? (
    <CarteDuBureau id="dossier" titre={tFiche('sections.dossier')} action={completude}>
      <div className="px-4 py-1">{piecesDuDossier}</div>
    </CarteDuBureau>
  ) : null;

  const carteQuoi = (
    <CarteDuBureau titre={tFiche('sections.quoi')}>
      {/* TCK-2876 — la contre-offre en cours, en tête du Quoi. */}
      {enTeteDuQuoi ? <div className="px-4 pt-4">{enTeteDuQuoi}</div> : null}
      <div className="grid grid-cols-1 gap-6 p-4 lg:grid-cols-2">
        <div>
          {bien}
          {comparaison ? <div className="mt-4">{comparaison}</div> : null}
          {dates ? <div className="mt-4">{dates}</div> : null}
          {nature !== 'offer' && nature !== 'stay' && message ? <div className="mt-4">{message}</div> : null}
        </div>
        <div>
          {montantDuSejour}
          {nature !== 'stay' ? lignesDuQuoi : null}
          {nature === 'offer' && message ? <div className="mt-3">{message}</div> : null}
        </div>
      </div>
    </CarteDuBureau>
  );
  const carteQui = qui ? (
    <CarteDuBureau titre={tFiche('sections.qui')}>
      <div className="p-4">
        {qui}
        {nature === 'stay' && message ? <div className="mt-3">{message}</div> : null}
      </div>
    </CarteDuBureau>
  ) : null;
  const cartePaiements = avecPaiements ? (
    <CarteDuBureau id={ancreSurLesPaiements ? 'paiement' : undefined} titre={tFiche('sections.paiements')}>
      <div className={cn('px-4', paiements.length > 0 ? 'py-1' : 'py-4')}>{listeDesPaiements}</div>
      {nature === 'stay' ? <div className="border-t border-border px-4 py-3">{lignesDuQuoi}</div> : null}
    </CarteDuBureau>
  ) : null;
  // L'ordre de la maquette : une offre se lit d'abord (Quoi), un séjour par ses paiements, une
  // candidature par la personne (Qui).
  const gauche =
    nature === 'offer'
      ? [carteQuoi, carteQui, carteDossier, cartePaiements]
      : nature === 'stay'
        ? [carteQuoi, cartePaiements, carteQui]
        : [carteQui, carteQuoi, carteDossier, cartePaiements];

  const enTeteComplet = booking.status !== 'pending';
  /** Au bureau, la carte « Autres gestes » porte ce que l'en-tête ne porte pas : l'encaissement hors séjour, et « Annuler » d'une demande à décider. */
  const gestesDuBureau = gestes.filter((g) => g!.key === 'paiement' || !enTeteComplet);

  return (
    <PagePleineLargeur data-slot="fiche-de-la-reservation">
      <DeclarerEnTete forme="detail" titre={titreDeLEnTete} repli={versLaListe} />
      {/* TCK-2846 — la fiche entre dans les récents sous son titre (« Réservation · Bien »). */}
      <RetenirLaFiche type="reservation" id={booking.id} titre={titre} chemin={`/app/bookings/${booking.id}`} />
      <PageHeader
        fil={{
          label: tConsole('breadcrumb'),
          etapes: [
            { label: tPages('title'), href: '/app/bookings' },
            ...(nature === 'autre' ? [] : [{ label: tNatures(nature), href: versLaListe }]),
            { label: nom },
          ],
        }}
        title={titre}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatutDeLaDemande statut={booking.status} />
            {/* TCK-2878 — « Déposée dim. 8 nov. à 20:12 par le lien envoyé après la visite · réponse attendue sous 48 h ». */}
            <span>{[titreDuBien, depotEnClair(booking) ?? etat, reponseAttendue, booking.reference_number].filter(Boolean).join(' · ')}</span>
          </span>
        }
        actions={
          <>
            {/* Une réservation confirmée garde « Annuler » et l'encaissement dans l'en-tête (maquette
                « Acceptée », « Séjour ») ; une demande à décider ne montre que la décision, ses autres
                gestes passent dans leur carte. */}
            {enTeteComplet && canCancel ? (
              <Button variant="ghost" onClick={annuler} disabled={cancelBooking.isPending}>
                {libelleAnnuler}
              </Button>
            ) : null}
            {/* TCK-2877 — maquette e5 (bureau) : Annuler, Rembourser, Enregistrer un paiement. */}
            {canRefundStay ? (
              <Button variant="outline" onClick={ouvrirLeRemboursement}>
                {tFiche('gestes.rembourser')}
              </Button>
            ) : null}
            {suite}
          </>
        }
      />
      <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_23.75rem]">
        <div className="min-w-0 space-y-5">
          {gauche.map((carte, i) => (carte ? <div key={i}>{carte}</div> : null))}
          {avisEtPaiementDuClient}
          {remboursement}
        </div>
        <div className="min-w-0 space-y-5">
          {/* TCK-2963 — la salle de la réservation, en tête de la colonne (maquette `fil-salle-bail` A, « fiche »). */}
          <BlocDeLaSalle nature="booking" id={booking.id} />
          {/* TCK-2878 — maquette e7 bureau : l'acceptation et le passage en Négociation en tête de la colonne. */}
          {bandeauAcceptee}
          {etapeDuClient}
          {suiteDuBail}
          {decisionDeLOffre}
          {decisionDeLaCandidature}
          {/* TCK-2878 — « Le fil de {prénom} » (e6 et e7), sous la décision. */}
          {filDuClient('carte')}
          {/* TCK-2877 — maquette e5 : les nuits du bien autour du séjour, au personnel. */}
          {nature === 'stay' && isDashboardAgent && !isCustomer && booking.property?.id && booking.start_date && booking.end_date ? (
            <NuitsDuBien bookingId={booking.id} propertyId={booking.property.id} debut={booking.start_date.slice(0, 10)} fin={booking.end_date.slice(0, 10)} />
          ) : null}
          {gestesDuBureau.length > 0 ? (
            <CarteDuBureau titre={tFiche('sections.autresGestes', { n: gestesDuBureau.length })}>
              <div className="divide-y divide-border px-4 py-1">{gestesDuBureau}</div>
            </CarteDuBureau>
          ) : null}
          <CarteDuBureau titre={tFiche('sections.historique')}>
            <div className="p-4">{historique}</div>
          </CarteDuBureau>
        </div>
      </div>
      {dialogues}
    </PagePleineLargeur>
  );
}

/** « −10 000 000 F » : un écart signé, en montant. */
function signe(valeur: number, montant: (v: number) => string): string {
  if (valeur === 0) return montant(0);
  return `${valeur < 0 ? '-' : '+'}${montant(Math.abs(valeur))}`;
}

/** Les jours écoulés depuis une date (jamais négatifs). */
function joursDepuis(depuis: string, maintenant: Date): number {
  const debut = Date.parse(depuis);
  if (Number.isNaN(debut)) return 0;
  return Math.max(0, Math.floor((maintenant.getTime() - debut) / 86_400_000));
}

/** Le geste d'un paiement : le reçu d'un paiement encaissé, le paiement en ligne d'un paiement attendu. */
function GesteDuPaiement({ p, providers }: { readonly p: BookingPayment; readonly providers: readonly GatewayProvider[] | undefined }) {
  const t = useTranslations('bookings');
  return (
    <>
      {p.status !== 'paid' ? (
        <StatusBadge
          tone={BOOKING_PAYMENT_STATUS_TONE[p.status] ?? 'neutral'}
          label={PAYMENT_STATUS_LABEL_KEY[p.status] ? t(PAYMENT_STATUS_LABEL_KEY[p.status]) : p.status}
        />
      ) : null}
      {p.status === 'pending' && (
        <PayOnlineButton paymentType="booking-payments" paymentId={p.id} currency={p.currency} availableProviders={providers} />
      )}
      {p.status === 'paid' && (
        <BoutonTelechargement chemin={`/api/booking-payments/${p.id}/receipt`} nomFichier={`recu-acompte-${p.id}.pdf`} variant="outline">
          {t('detail.receipt')}
        </BoutonTelechargement>
      )}
    </>
  );
}

/**
 * L'historique, du plus récent au plus ancien : la demande (déposée par le client, ou saisie par le
 * personnel), sa confirmation, l'acompte réglé, l'annulation, l'expiration.
 */
function evenementsDeLHistorique(
  booking: Booking,
  nature: Nature,
  nom: string,
  tFiche: ReturnType<typeof useTranslations<'bookings.fiche'>>,
  t: ReturnType<typeof useTranslations<'bookings.detail'>>,
): EvenementDeLHistorique[] {
  const evenements: EvenementDeLHistorique[] = [];
  if (booking.created_at) {
    const saisie = booking.recorded_by_staff && booking.created_by?.name;
    evenements.push({
      cle: 'creee',
      at: booking.created_at,
      quoi: saisie ? tFiche('historique.saisie', { nature, nom: booking.created_by!.name }) : tFiche('historique.creee', { nature, nom }),
    });
  }
  const confirmedAt = booking.confirmed_at ?? booking.confirmation_date;
  if (confirmedAt) evenements.push({ cle: 'confirmee', at: confirmedAt, quoi: t('timeline.confirmed') });
  const acompte = acomptePaye(booking);
  const acompteLe = acompte?.paid_at ?? acompte?.payment_date;
  if (acompteLe) evenements.push({ cle: 'acompte', at: acompteLe, quoi: t('timeline.depositPaid') });
  const cancelledAt = booking.cancelled_at ?? booking.cancellation_date;
  if (cancelledAt) evenements.push({ cle: 'annulee', at: cancelledAt, quoi: t('timeline.cancelled') });
  const expiredAt = booking.expired_at ?? booking.expires_at;
  if (expiredAt && booking.status === 'expired') evenements.push({ cle: 'expiree', at: expiredAt, quoi: t('timeline.expired') });
  // Le tri et la mise en forme : `HistoriqueDeLaFiche`, qui y mêle les visites du client (TCK-2875).
  return evenements;
}

function CustomerPayCta({
  bookingId,
  booking,
  providers,
}: {
  bookingId: number;
  booking: Booking;
  providers: readonly GatewayProvider[] | undefined;
}) {
  const t = useTranslations('bookings.detail');
  const createPayment = useCreateBookingPayment(bookingId);
  const messageErreur = useMessageErreurApi();
  // P210.02 (TCK-2082) — le refus de l'API (422 `booking_payment.nothing_due` quand le paiement a
  // été acquitté pendant que la fiche montrait encore le bouton) se dit sous le bouton (ADR-0019).
  const [erreur, setErreur] = useState<string | null>(null);
  const payments = booking.booking_payments ?? [];
  const hasPending = payments.some((p) => p.status === 'pending');

  // Don't show the CTA if there's already a pending payment row — the user
  // can pay it via the existing PayOnlineButton just below.
  if (hasPending) return null;

  if (booking.status !== 'pending' && booking.status !== 'confirmed') return null;
  // TCK-2879 — un séjour seulement : le `total_amount` d'une candidature est le loyer du bien, celui d'une
  // offre le prix proposé — rien que le client règle sur la réservation (`appelDuClient`, même règle).
  if (booking.kind === 'application' || booking.kind === 'offer') return null;
  if (providers !== undefined && providers.length === 0) return null;

  // TCK-2877 — comme l'API (`dueFromCustomer`) : ni caution ni « autre ».
  const succeededTotal = payments
    .filter(regleLeTotal)
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  const total = Number(booking.total_amount ?? 0);
  const remaining = Math.max(total - succeededTotal, 0);
  if (remaining <= 0) return null;

  const depositAmount = Number(booking.deposit_amount ?? 0);
  const isDepositStep = succeededTotal === 0 && depositAmount > 0;
  const label = isDepositStep ? t('payCta.deposit') : t('payCta.balance');

  // TCK-1309 (P133.05) — le montant et sa nature sont dérivés par l'API (acompte, puis reste
  // dû) : le calcul ci-dessus ne sert plus qu'au libellé.
  async function handleClick() {
    setErreur(null);
    try {
      await createPayment.mutateAsync({ status: 'pending' });
    } catch (e) {
      setErreur(messageErreur(e));
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight text-foreground">{label}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('payCta.notice')}</p>
        </div>
        <Button
          onClick={() => void handleClick()}
          disabled={createPayment.isPending}
          className="h-10 w-full sm:h-8 sm:w-auto"
        >
          {label}
        </Button>
      </div>
      {erreur ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {erreur}
        </p>
      ) : null}
    </section>
  );
}


/**
 * TCK-2877 (TCK-2892) — un paiement encaissé qui règle le séjour : ni la caution (rendue au départ),
 * ni un paiement « autre » — ceux que `BookingPaymentService::dueFromCustomer` ne déduit pas.
 */
function regleLeTotal(p: BookingPayment): boolean {
  return p.status === 'paid' && p.payment_type !== 'security_deposit' && p.payment_type !== 'other';
}

/**
 * TCK-1180 (P100.02) — l'acompte réglé, lu dans les `booking_payments` que le `show` rend : l'API
 * n'émet ni `deposit_paid` ni `deposit_date`, et le badge comme l'événement ne s'affichaient jamais.
 */
function acomptePaye(booking: Booking): BookingPayment | undefined {
  return booking.booking_payments?.find((p) => p.payment_type === 'deposit' && p.status === 'paid');
}
