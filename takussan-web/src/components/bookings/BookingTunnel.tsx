'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, Building2, CalendarRange, CircleCheck, Clock, FlaskConical, Loader2, Minus, Plus, Tag, X } from 'lucide-react';

import { WhatsAppButton } from '@/components/contact/WhatsAppButton';
import { EmptyState } from '@/components/feedback';
// Le fichier, pas le barrel : `@/components/forms` charge react-hook-form (zod-hors-des-pages-publiques).
import { FormGlobalError } from '@/components/forms/FormError';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Textarea } from '@/components/ui/textarea';
import { WarningBanner } from '@/components/ui/warning-banner';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import type { Locale } from '@/i18n/config';
import { hrefLocalise } from '@/i18n/navigation';
import { ApiError } from '@/lib/api';
import { BOOKING_DEPOSIT_PERCENT, quoteBooking } from '@/lib/booking-quote';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { jourDeLApi } from '@/lib/jour-de-l-api';
import type { OccupiedRange } from '@/lib/occupancy';
import { ROUTES_LEGALES } from '@/lib/legal-routes';
import { DestructiveBanner } from '@/components/ui/destructive-banner';
import { fieldDensityScope } from '@/components/ui/field-density';
import { formaterTelephone, numeroComposable } from '@/lib/phone';
import { useCreateBooking } from '@/lib/queries/bookings';
import { cn } from '@/lib/utils';
import type { Booking } from '@/types/booking';
import type { PropertyDetail } from '@/types/property';
import {
  choisirJour,
  nombreDeNuits,
  selectionComplete,
  selectionTenable,
  SELECTION_VIDE,
  type ContexteDuCalendrier,
  type SelectionDeNuits,
} from './calendrier-des-nuits';
import { CalendrierDesNuits } from './CalendrierDesNuits';
import { hrefConnexionPour } from '@/components/auth/lien-connexion';

import { cheminDuTunnel, PERSONNES_MAX, PERSONNES_MIN, type SejourDemande } from './tunnel-de-reservation';
import { useDrapeauConnexionParTelephone, useIdentiteParTelephone } from './useIdentiteParTelephone';
import { useNuitsPrises } from './useNuitsPrises';

/** Cibles d'au moins 44 px : une page publique, lue au doigt (revue design 2026-09-16). */
const CTA = 'h-12 px-5 text-[0.9375rem] font-semibold';

/** Les refus de l'API sur des nuits déjà prises (TCK-596, `PropertyAvailabilityService`). */
const CODES_NUITS_PRISES = new Set(['booking.dates_overlap', 'booking.dates_unavailable']);

/** Les champs de l'écran des dates : un refus sur eux y ramène. */
const CHAMPS_DES_DATES = ['start_date', 'end_date', 'guests'];

type Ecran = 'dates' | 'recap' | 'envoyee';

interface BookingTunnelProps {
  readonly property: PropertyDetail;
  /** Le séjour rapporté par l'URL (retour de connexion, fiche) : dates et personnes conservées. */
  readonly sejourInitial?: SejourDemande;
}

/**
 * TCK-2510 — le tunnel de réservation courte durée, « Les dates d'abord » : trois écrans au lieu
 * de quatre étapes.
 *
 * 1. **Dates** — un calendrier plein écran (douze mois l'un sous l'autre au téléphone, deux mois
 *    côte à côte en bureau) où les nuits prises sont barrées, et le total en barre basse, recalculé
 *    à chaque toucher.
 * 2. **Votre demande** — récapitulatif, « c'est une demande » dit AVANT l'envoi, identité (numéro
 *    et code SMS quand `phone_login` est ouvert, sinon le renvoi vers la connexion, dates
 *    conservées), message, conditions, envoi.
 * 3. **Envoyée** — la référence et le montant ENREGISTRÉS par l'API, l'échéance de réponse, et ce
 *    qui se passe ensuite.
 *
 * Ce qui ne change pas : le montant affiché est celui de `booking-quote.ts` (même arrondi que
 * l'API, qui recalcule et n'en reçoit rien) ; le serveur refuse un séjour sur des nuits prises,
 * et ce refus ramène au calendrier, relu ; un bien au mois relève du bail.
 */
export function BookingTunnel({ property, sejourInitial }: BookingTunnelProps) {
  const router = useRouter();
  const locale = useLocale() as Locale;
  const t = useTranslations('bookings.tunnel');
  const fmt = useFormatteurs();
  const messageErreur = useMessageErreurApi();
  const { user, isLoading: authLoading } = useAuth();
  const bureau = useMatchesMedia('(min-width: 1024px)');

  const [ecran, setEcran] = useState<Ecran>(() =>
    sejourInitial?.debut && sejourInitial.fin ? 'recap' : 'dates',
  );
  const [selection, setSelection] = useState<SelectionDeNuits>(() => ({
    arrivee: sejourInitial?.debut ?? null,
    depart: sejourInitial?.debut ? (sejourInitial.fin ?? null) : null,
  }));
  const [personnes, setPersonnes] = useState(sejourInitial?.personnes ?? PERSONNES_MIN);
  const [message, setMessage] = useState('');
  const [accepte, setAccepte] = useState(false);
  const [conditionsManquantes, setConditionsManquantes] = useState(false);
  const [avisDates, setAvisDates] = useState<string | null>(null);
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [lecture, setLecture] = useState(0);

  const quote = quoteBooking(property, nombreDeNuits(selection.arrivee, selection.depart));
  const sejourCourt = quote.kind === 'stay';
  const nuitsPrises = useNuitsPrises(property.slug, sejourCourt, lecture);
  const aujourdhui = jourDeLApi();
  const contexte: ContexteDuCalendrier = { aujourdhui, plages: nuitsPrises.plages };
  const complete = selectionComplete(selection, contexte);

  const createBooking = useCreateBooking();
  const identite = useIdentiteParTelephone();
  const drapeau = useDrapeauConnexionParTelephone();

  // Les nuits prises arrivent après le premier rendu : des dates rapportées par l'URL, ou gardées
  // pendant une connexion, qui sont devenues prises entre-temps tombent, et l'écran le dit.
  const [plagesVerifiees, setPlagesVerifiees] = useState<readonly OccupiedRange[] | null>(null);
  if (nuitsPrises.etat === 'pret' && plagesVerifiees !== nuitsPrises.plages) {
    setPlagesVerifiees(nuitsPrises.plages);
    const tenable = selectionTenable(selection, contexte);
    if (tenable !== selection) {
      setSelection(tenable);
      setAvisDates(t('dates.noLongerFree'));
      if (ecran === 'recap') setEcran('dates');
    }
  }

  // L'adresse suit le séjour : un rechargement, un retour arrière ou un partage le gardent.
  //
  // `replaceState(null, …)` — la forme que Next 16 documente (« Native History API ») : son patch de
  // `history.replaceState` passe alors par `applyUrlFromHistoryPushReplace`, et l'URL canonique du
  // routeur suit. Avec `window.history.state` (qui porte `__NA`), le patch court-circuite le routeur
  // et la prochaine action de celui-ci remettait l'URL sans les dates (revue TCK-2510, mineur 3).
  // Pas `router.replace` : c'est une navigation, qui rendait la page AU SERVEUR (et relisait le bien
  // à l'API) à chaque jour touché — mesuré : 4 requêtes RSC pour 2 clics, l'URL en retard d'autant.
  useEffect(() => {
    if (ecran === 'envoyee') return;
    const chemin = hrefLocalise(
      cheminDuTunnel(property.slug, { debut: selection.arrivee, fin: selection.depart, personnes }),
      locale,
    );
    if (`${window.location.pathname}${window.location.search}` !== chemin) {
      window.history.replaceState(null, '', chemin);
    }
  }, [ecran, selection, personnes, property.slug, locale]);

  const envoiApresConnexion = useRef(false);

  const money = (value: number) => fmt.montant(value, property.currency ?? 'XOF');
  const cheminRetour = hrefLocalise(
    cheminDuTunnel(property.slug, { debut: selection.arrivee, fin: selection.depart, personnes }),
    locale,
  );

  // TCK-2604 — une seule porte (`/auth/register` y redirige), et l'action interrompue : la
  // connexion montre le bien de ce séjour. Sans la voie téléphone, « Créer un compte » y ouvre
  // l'inscription par e-mail (`voie=inscription`).
  function versLaConnexion(page: 'login' | 'register' = 'login'): void {
    router.push(`${hrefConnexionPour(cheminRetour, 'reservation')}${page === 'register' ? '&voie=inscription' : ''}`);
  }

  function choisir(jour: string): void {
    setAvisDates(null);
    setSelection((courante) => choisirJour(courante, jour, contexte));
  }

  function haut(): void {
    window.scrollTo({ top: 0 });
  }

  async function envoyer(): Promise<void> {
    if (!selectionComplete(selection, contexte)) {
      setEcran('dates');
      return;
    }
    setErreurGlobale(null);
    try {
      const res = await createBooking.mutateAsync({
        property_id: property.id,
        start_date: selection.arrivee as string,
        end_date: selection.depart as string,
        guests: personnes,
        notes: message.trim() === '' ? undefined : message.trim(),
      });
      setBooking(res.data);
      setEcran('envoyee');
      haut();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        versLaConnexion();
        return;
      }
      if (err instanceof ApiError && err.status === 422) {
        const code = err.data && typeof err.data === 'object' ? (err.data as { code?: unknown }).code : undefined;
        // TCK-596 — des nuits confirmées entre-temps : retour au calendrier, relu, et le départ tombe.
        if (typeof code === 'string' && CODES_NUITS_PRISES.has(code)) {
          setSelection({ arrivee: selection.arrivee, depart: null });
          setAvisDates(messageErreur(err, t('dates.noLongerFree')));
          setLecture((n) => n + 1);
          setEcran('dates');
          haut();
          return;
        }
        const champs = err.validationErrors ?? {};
        const surLesDates = CHAMPS_DES_DATES.find((champ) => champ in champs);
        if (surLesDates) {
          setAvisDates(champs[surLesDates]?.[0] ?? t('error'));
          setEcran('dates');
          haut();
          return;
        }
        const messages = Object.values(champs).flat();
        // Un refus sur `property_id` (bien passé au mois entre-temps, TCK-530) n'a pas de champ à
        // l'écran : il se dit en erreur globale.
        setErreurGlobale(messages.length > 0 ? messages.join(' ') : messageErreur(err, t('error')));
        return;
      }
      setErreurGlobale(messageErreur(err, t('error')));
    }
  }

  async function agir(): Promise<void> {
    setErreurGlobale(null);
    if (!accepte) {
      setConditionsManquantes(true);
      return;
    }
    if (user) {
      await envoyer();
      return;
    }
    if (drapeau !== true) {
      versLaConnexion();
      return;
    }
    if (identite.etape === 'numero') {
      if ((await identite.demanderCode()) === 'repli') versLaConnexion();
      return;
    }
    // Posé AVANT la vérification : `openSession` change le compte pendant qu'elle s'achève, et
    // l'effet qui envoie peut passer avant que `verifier()` ne rende la main.
    envoiApresConnexion.current = true;
    const issue = await identite.verifier();
    if (issue !== 'connecte') envoiApresConnexion.current = false;
    if (issue === 'repli') versLaConnexion();
  }

  // Après une connexion par numéro, l'envoi part au rendu suivant : la mutation lit le jeton
  // d'`AuthContext` au rendu (`useApiMutation`), et celui d'avant la connexion était vide.
  // Déclaré APRÈS `useCreateBooking`, cet effet passe après celui qui lui pose le nouveau jeton.
  useEffect(() => {
    if (user && envoiApresConnexion.current) {
      envoiApresConnexion.current = false;
      void envoyer();
    }
    // `envoyer` est recréée à chaque rendu : seule l'arrivée du compte déclenche l'envoi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ─── Ce que le tunnel ne réserve pas ─────────────────────────────────────────────────────────
  if (quote.kind !== 'stay') {
    return <HorsSejourCourt property={property} vente={quote.kind === 'flat'} />;
  }

  const nuits = quote.nights;
  const titreDesDates =
    selection.arrivee && selection.depart
      ? t('dates.range', { debut: fmt.date(selection.arrivee, FORMAT_JOUR), fin: fmt.date(selection.depart, FORMAT_JOUR) })
      : selection.arrivee
        ? t('dates.chooseDeparture', { date: fmt.date(selection.arrivee, FORMAT_JOUR) })
        : t('dates.title');
  const resumeNuits = [t('nights', { count: nuits }), t('guests.count', { count: personnes })].join(' · ');

  const detailDuPrix = (
    <dl className="space-y-2 text-[0.9375rem] tabular-nums">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="min-w-0 text-muted-foreground" data-testid="booking-price-line">
          {quote.period === 'weekly'
            ? t('weeklyLine', { price: money(property.price), nights: t('nights', { count: nuits }) })
            : t('dailyLine', { price: money(property.price), nights: t('nights', { count: nuits }) })}
        </dt>
        <dd className="shrink-0 whitespace-nowrap">{money(quote.total)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2 font-semibold">
        <dt>{t('recap.total')}</dt>
        <dd className="shrink-0 whitespace-nowrap" data-testid="booking-total">
          {money(quote.total)}
        </dd>
      </div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <dt className="min-w-0 text-muted-foreground">{t('recap.deposit', { percent: BOOKING_DEPOSIT_PERCENT })}</dt>
        <dd className="shrink-0 whitespace-nowrap" data-testid="booking-deposit">
          {money(quote.deposit)}
        </dd>
      </div>
    </dl>
  );

  // ─── 1. Les dates ─────────────────────────────────────────────────────────────────────────────
  if (ecran === 'dates') {
    const continuer = (
      <Button
        type="button"
        size="lg"
        className={cn(CTA, 'w-full')}
        disabled={!complete}
        onClick={() => {
          setEcran('recap');
          haut();
        }}
      >
        {t('dates.continue')}
      </Button>
    );
    return (
      <div className="lg:mx-auto lg:grid lg:max-w-6xl lg:grid-cols-[1fr_380px] lg:gap-12 lg:px-8 lg:py-10">
        <div className="flex min-h-dvh flex-col lg:min-h-0">
          <header className="sticky top-0 z-10 border-b border-border bg-background px-4 pb-3 pt-2 lg:static lg:border-0 lg:px-0 lg:pt-0">
            <div className="flex items-center justify-between lg:hidden">
              <LienLocalise
                href={`/properties/${property.slug}`}
                aria-label={t('backToProperty')}
                className="-ml-2 inline-flex size-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
              >
                <X className="size-5" aria-hidden />
              </LienLocalise>
              <BoutonEffacer visible={selection.arrivee !== null} onClick={() => setSelection(SELECTION_VIDE)} />
            </div>
            <LienRetour href={`/properties/${property.slug}`} className="hidden lg:inline-flex">
              {t('backToProperty')}
            </LienRetour>
            <h1 className="mt-1 text-balance font-display text-2xl font-semibold tracking-tight lg:mt-3 lg:text-4xl" aria-live="polite">
              {titreDesDates}
            </h1>
            <p className="text-pretty text-[0.9375rem] text-muted-foreground" data-testid="booking-dates-hint">
              {nuitsPrises.etat === 'chargement'
                ? t('dates.loading')
                : nuitsPrises.etat === 'erreur'
                  ? t('dates.loadError')
                  : nuits > 0
                    ? `${t('nights', { count: nuits })} · ${t('dates.hint')}`
                    : t('dates.hint')}
            </p>
          </header>

          <div className="flex-1 px-3 pb-6 pt-4 lg:px-0">
            {avisDates ? (
              <DestructiveBanner className="mx-1 mb-4">{avisDates}</DestructiveBanner>
            ) : null}
            <CalendrierDesNuits
              selection={selection}
              contexte={contexte}
              onChoisir={choisir}
              disposition={bureau ? 'pages' : 'defilement'}
              enAttente={nuitsPrises.etat === 'chargement'}
            />
            <div className="mt-4 flex justify-end max-lg:hidden">
              <BoutonEffacer visible={selection.arrivee !== null} onClick={() => setSelection(SELECTION_VIDE)} />
            </div>
            <div className="mx-1 mt-6 border-t border-border pt-4">
              <Personnes valeur={personnes} onChange={setPersonnes} />
            </div>
          </div>

          {/* Au bureau, l'aside porte déjà le total et « Continuer » : la barre ne le redit pas. */}
          <BarreBasse
            className="lg:hidden"
            gauche={
              <div className="min-w-0">
                <p className="font-display text-lg font-semibold tabular-nums" data-testid="booking-bar-total">
                  {complete ? money(quote.total) : '—'}
                </p>
                <p className="truncate text-[0.8125rem] text-muted-foreground">{complete ? resumeNuits : t('dates.noDates')}</p>
              </div>
            }
          >
            {continuer}
          </BarreBasse>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-40 space-y-4 rounded-2xl bg-card p-5 ring-1 ring-border">
            <RecapDuBien property={property} />
            {complete ? (
              <>
                <p className="border-t border-border pt-4 text-[0.9375rem] font-medium">{resumeNuits}</p>
                {detailDuPrix}
              </>
            ) : (
              <p className="border-t border-border pt-4 text-sm text-muted-foreground">{t('dates.noDates')}</p>
            )}
            {continuer}
            <p className="text-center text-sm text-muted-foreground">{t('noCharge')}</p>
          </div>
        </aside>
      </div>
    );
  }

  // ─── 3. Envoyée ───────────────────────────────────────────────────────────────────────────────
  if (ecran === 'envoyee' && booking) {
    const echeance = booking.response_deadline ?? null;
    const devise = booking.currency ?? property.currency ?? 'XOF';
    return (
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col lg:min-h-0 lg:py-12">
        <div className="flex-1 px-4 pt-10 text-center lg:pt-0">
          <span className="mx-auto inline-flex size-14 items-center justify-center rounded-full bg-muted text-success">
            <CircleCheck className="size-8" aria-hidden />
          </span>
          <h1 className="mt-4 text-balance font-display text-[1.625rem] font-semibold leading-tight tracking-tight">{t('success.title')}</h1>
          <p className="mx-auto mt-2 max-w-md text-pretty text-[0.9375rem] text-muted-foreground">
            {t.rich('success.body', { title: property.title, strong: (chunks) => <strong className="text-foreground">{chunks}</strong> })}
          </p>
          {/* TCK-575 — l'échéance PROPRE à la demande (`response_deadline`), jamais un délai écrit en dur. */}
          <p data-testid="booking-success-deadline" className="mx-auto mt-2 max-w-md text-pretty text-[0.9375rem] text-muted-foreground">
            {echeance
              ? t.rich('success.deadline', {
                  date: fmt.dateTime(echeance, { dateStyle: 'full', timeStyle: 'short' }),
                  strong: (chunks) => <strong className="text-foreground">{chunks}</strong>,
                })
              : t('success.noDeadline')}
          </p>

          <section className="mt-6 rounded-2xl bg-card p-4 text-left ring-1 ring-border">
            <RecapDuBien property={property} />
            <dl className="mt-4 space-y-2 border-t border-border pt-3 text-[0.9375rem]">
              {booking.start_date && booking.end_date ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{t('success.dates')}</dt>
                  <dd className="text-right">
                    {t('dates.range', { debut: fmt.date(booking.start_date, FORMAT_JOUR), fin: fmt.date(booking.end_date, FORMAT_JOUR) })}
                  </dd>
                </div>
              ) : null}
              {/* Le montant ENREGISTRÉ, tel que l'API le rend — pas l'estimation du front. */}
              {booking.total_amount !== null ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{t('success.total')}</dt>
                  <dd className="font-semibold tabular-nums" data-testid="booking-success-total">
                    {fmt.montant(booking.total_amount, devise)}
                  </dd>
                </div>
              ) : null}
              {booking.reference_number ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{t('success.reference')}</dt>
                  <dd className="font-mono text-sm">{booking.reference_number}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <h2 className="mt-8 text-left text-[0.8125rem] font-semibold text-muted-foreground">{t('success.next')}</h2>
          <ol className="mt-3 space-y-3 pb-8 text-left">
            <Etape numero={1} actif titre={t('success.step1')} detail={echeance ? t('success.step1Deadline', { date: fmt.dateTime(echeance, { dateStyle: 'medium', timeStyle: 'short' }) }) : null} />
            <Etape
              numero={2}
              titre={
                booking.deposit_amount !== null && booking.deposit_amount > 0
                  ? t('success.step2', { amount: fmt.montant(booking.deposit_amount, devise) })
                  : t('success.step2NoAmount')
              }
              detail={t('success.step2Detail')}
            />
          </ol>
        </div>
        <BarreBasse
          gauche={
            // Maquette A : écrire au contact sur WhatsApp — seulement quand l'API dit qu'il en a un
            // (`has_whatsapp`, jamais le numéro : il se révèle au geste, TCK-590). Sinon, la fiche.
            contactDuBien(property)?.has_whatsapp === true ? (
              <WhatsAppButton slug={property.slug} title={property.title} hasWhatsApp className={cn(CTA, 'w-auto gap-2 px-4 py-0')}>
                {t('success.whatsapp')}
              </WhatsAppButton>
            ) : (
              <Button variant="outline" size="lg" className={CTA} nativeButton={false} render={<LienLocalise href={`/properties/${property.slug}`} />}>
                {t('backToProperty')}
              </Button>
            )
          }
        >
          <Button size="lg" className={cn(CTA, 'flex-1')} nativeButton={false} render={<LienLocalise href={`/app/bookings/${booking.id}`} />}>
            {t('success.follow')}
          </Button>
        </BarreBasse>
      </div>
    );
  }

  // ─── 2. Votre demande ─────────────────────────────────────────────────────────────────────────
  const enCours = createBooking.isPending || identite.enCours;
  const anonyme = !authLoading && !user;
  const libelleAction = enCours
    ? createBooking.isPending
      ? t('recap.submitting')
      : identite.etape === 'numero'
        ? t('identity.sending')
        : t('identity.verifying')
    : user || authLoading
      ? t('recap.submit')
      : drapeau === true
        ? identite.etape === 'numero'
          ? t('identity.sendCode')
          : t('identity.verifyAndSend')
        : t('login.submit');
  const actionBloquee =
    enCours ||
    authLoading ||
    // Le drapeau `phone_login` pas encore lu : ni le numéro, ni le renvoi — on ne sait pas lequel.
    (anonyme && drapeau === null) ||
    (anonyme && drapeau === true && identite.etape === 'numero' && !numeroComposable(identite.telephone)) ||
    (anonyme && drapeau === true && identite.etape === 'code' && identite.code.length !== 6);

  const resumeDuSejour = (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[0.9375rem] font-medium">{titreDesDates}</p>
        <p className="text-sm text-muted-foreground">{resumeNuits}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          setEcran('dates');
          haut();
        }}
        className="-mr-2 min-h-11 rounded-lg px-2 text-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
      >
        {t('recap.edit')}
      </button>
    </div>
  );

  return (
    <div className="lg:mx-auto lg:grid lg:max-w-6xl lg:grid-cols-[1fr_400px] lg:gap-14 lg:px-8 lg:py-10">
      <form
        className="flex min-h-dvh flex-col lg:min-h-0"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void agir();
        }}
      >
        <header className="flex items-center gap-2 px-2 pt-2 lg:block lg:px-0 lg:pt-0">
          <button
            type="button"
            onClick={() => {
              setEcran('dates');
              haut();
            }}
            aria-label={t('recap.back')}
            className="inline-flex size-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring lg:hidden"
          >
            <ArrowLeft className="size-5" aria-hidden />
          </button>
          <LienRetour href={`/properties/${property.slug}`} className="hidden lg:inline-flex">
            {t('backToProperty')}
          </LienRetour>
          <h1 className="font-display text-xl font-semibold tracking-tight lg:mt-3 lg:text-4xl">{t('recap.title')}</h1>
        </header>

        <div className="flex-1 space-y-6 px-4 pb-8 pt-3 lg:px-0 lg:pt-6">
          <section className="space-y-4 rounded-2xl bg-card p-4 ring-1 ring-border lg:hidden">
            <RecapDuBien property={property} />
            <div className="border-t border-border pt-3">{resumeDuSejour}</div>
            <div className="border-t border-border pt-3">{detailDuPrix}</div>
          </section>

          {/* « Une DEMANDE, jamais une réservation instantanée : dit avant l'envoi. » */}
          <div className="flex items-start gap-3 rounded-xl bg-muted px-3.5 py-3" data-testid="booking-request-notice">
            <Clock className="mt-0.5 size-4 flex-none text-muted-foreground" aria-hidden />
            <p className="text-pretty text-sm leading-snug">
              {t.rich('recap.requestNotice', { strong: (chunks) => <strong className="font-medium">{chunks}</strong> })}
            </p>
          </div>

          <FormGlobalError>{erreurGlobale}</FormGlobalError>

          {anonyme && drapeau === true ? (
            <Identite identite={identite} />
          ) : anonyme && drapeau === false ? (
            <div className="space-y-1" data-testid="booking-login-notice">
              <p className="text-[0.9375rem] font-medium">{t('login.title')}</p>
              <p className="text-pretty text-sm text-muted-foreground">{t('login.body')}</p>
              <button
                type="button"
                onClick={() => versLaConnexion('register')}
                className="-ml-2 min-h-11 rounded-lg px-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
              >
                {t('login.register')}
              </button>
            </div>
          ) : null}

          <div className="space-y-1.5 lg:max-w-xl">
            <label htmlFor="booking-message" className="block text-[0.9375rem] font-medium">
              {t('recap.message')}
            </label>
            <Textarea
              id="booking-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('notesPlaceholder')}
              rows={3}
              maxLength={1000}
            />
          </div>

          <div>
            <label className="flex cursor-pointer items-start gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={accepte}
                onChange={(e) => {
                  setAccepte(e.target.checked);
                  if (e.target.checked) setConditionsManquantes(false);
                }}
                aria-invalid={conditionsManquantes || undefined}
                aria-describedby={conditionsManquantes ? 'booking-conditions-erreur' : undefined}
                className="mt-0.5 size-5 shrink-0 cursor-pointer rounded border-input accent-primary"
              />
              <span className="text-pretty leading-snug">
                {t.rich('recap.accept', {
                  terms: (chunks) => (
                    <LienLocalise href={ROUTES_LEGALES.terms} target="_blank" rel="noopener" className="font-medium underline underline-offset-4">
                      {chunks}
                    </LienLocalise>
                  ),
                  privacy: (chunks) => (
                    <LienLocalise href={ROUTES_LEGALES.privacy} target="_blank" rel="noopener" className="font-medium underline underline-offset-4">
                      {chunks}
                    </LienLocalise>
                  ),
                })}
              </span>
            </label>
            {conditionsManquantes ? (
              <p id="booking-conditions-erreur" role="alert" className="mt-1 pl-8 text-sm text-destructive">
                {t('recap.acceptRequired')}
              </p>
            ) : null}
          </div>

          <Button type="submit" size="lg" className={cn(CTA, 'hidden lg:inline-flex')} disabled={actionBloquee}>
            {enCours ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {libelleAction}
          </Button>
        </div>

        <BarreBasse
          className="lg:hidden"
          gauche={
            <div className="min-w-0">
              <p className="font-display text-lg font-semibold tabular-nums">{money(quote.total)}</p>
              <p className="truncate text-[0.8125rem] text-muted-foreground">{resumeNuits}</p>
            </div>
          }
        >
          <Button type="submit" size="lg" className={cn(CTA, 'flex-1')} disabled={actionBloquee}>
            {enCours ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {libelleAction}
          </Button>
        </BarreBasse>
      </form>

      <aside className="hidden lg:block">
        <div className="sticky top-40 space-y-4 rounded-2xl bg-card p-5 ring-1 ring-border">
          <RecapDuBien property={property} grand />
          <div className="border-t border-border pt-4">{resumeDuSejour}</div>
          <div className="border-t border-border pt-4">{detailDuPrix}</div>
          <p className="text-sm text-muted-foreground">{t('noCharge')}</p>
        </div>
      </aside>
    </div>
  );
}

const FORMAT_JOUR: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };

// ─── Morceaux ─────────────────────────────────────────────────────────────────────────────────

function BarreBasse({ gauche, children, className }: { readonly gauche?: ReactNode; readonly children: ReactNode; readonly className?: string }) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-10 flex items-center gap-3 border-t border-border bg-card px-4 pb-[max(var(--spacing)*4,env(safe-area-inset-bottom))] pt-3',
        'lg:static lg:border-0 lg:bg-transparent lg:px-0 lg:pb-0',
        className,
      )}
    >
      {gauche}
      <div className="flex flex-1 justify-end">{children}</div>
    </div>
  );
}

function BoutonEffacer({ visible, onClick }: { readonly visible: boolean; readonly onClick: () => void }) {
  const t = useTranslations('bookings.tunnel.dates');
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!visible}
      className="-mr-2 min-h-11 rounded-lg px-2 text-[0.9375rem] font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:invisible"
    >
      {t('clear')}
    </button>
  );
}

function LienRetour({ href, className, children }: { readonly href: string; readonly className?: string; readonly children: ReactNode }) {
  return (
    <LienLocalise
      href={href}
      className={cn(
        'items-center gap-2 rounded-lg text-[0.9375rem] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring',
        className,
      )}
    >
      <ArrowLeft className="size-4" aria-hidden />
      {children}
    </LienLocalise>
  );
}

function RecapDuBien({ property, grand = false }: { readonly property: PropertyDetail; readonly grand?: boolean }) {
  const t = useTranslations('bookings.tunnel');
  const fmt = useFormatteurs();
  const lieu = property.location?.quarter ?? property.location?.city ?? null;
  const unite = property.rent_period === 'weekly' ? t('unit.weekly') : t('unit.daily');
  const photo = (
    <div className={cn('relative grid flex-none place-items-center overflow-hidden rounded-xl bg-muted', grand ? 'aspect-[16/10] w-full' : 'size-14')}>
      {property.main_photo_url ? (
        <Image
          src={property.main_photo_url}
          alt=""
          fill
          sizes={grand ? '400px' : '56px'}
          className="object-cover outline -outline-offset-1 outline-foreground/10"
        />
      ) : (
        <Building2 className="size-6 text-muted-foreground" aria-hidden />
      )}
    </div>
  );
  const texte = (
    <div className="min-w-0">
      <p className={cn('font-medium', grand ? 'mt-3 font-semibold' : 'truncate text-[0.9375rem]')}>{property.title}</p>
      <p className="text-sm tabular-nums text-muted-foreground">
        {lieu ? `${lieu} · ` : ''}
        {fmt.montant(property.price, property.currency ?? 'XOF')} / {unite}
      </p>
    </div>
  );
  if (grand) {
    return (
      <div>
        {photo}
        {texte}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      {photo}
      {texte}
    </div>
  );
}

function Personnes({ valeur, onChange }: { readonly valeur: number; readonly onChange: (n: number) => void }) {
  const t = useTranslations('bookings.tunnel.guests');
  const bouton =
    'inline-flex size-11 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:border-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:text-muted-foreground disabled:hover:border-border';
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-[0.9375rem] font-medium" id="booking-guests-label">
        {t('label')}
      </p>
      <div className="flex items-center gap-4" role="group" aria-labelledby="booking-guests-label">
        <button type="button" className={bouton} aria-label={t('less')} disabled={valeur <= PERSONNES_MIN} onClick={() => onChange(Math.max(PERSONNES_MIN, valeur - 1))}>
          <Minus className="size-4" aria-hidden />
        </button>
        <span className="w-5 text-center text-[1.0625rem] font-semibold tabular-nums" aria-live="polite" data-testid="booking-guests">
          {valeur}
        </span>
        <button type="button" className={bouton} aria-label={t('more')} disabled={valeur >= PERSONNES_MAX} onClick={() => onChange(Math.min(PERSONNES_MAX, valeur + 1))}>
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function Etape({ numero, titre, detail, actif = false }: { readonly numero: number; readonly titre: string; readonly detail: string | null; readonly actif?: boolean }) {
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          'inline-flex size-7 flex-none items-center justify-center rounded-full text-[0.8125rem] font-semibold tabular-nums',
          actif ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground',
        )}
        aria-hidden
      >
        {numero}
      </span>
      <div>
        <p className="text-[0.9375rem] font-medium">{titre}</p>
        {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
      </div>
    </li>
  );
}

function Identite({ identite }: { readonly identite: ReturnType<typeof useIdentiteParTelephone> }) {
  const t = useTranslations('bookings.tunnel.identity');
  // Le code envoyé, le champ du code prend la main — une fois, pas à chaque seconde du compte à rebours.
  const champDuCode = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (identite.etape === 'code') champDuCode.current?.focus();
  }, [identite.etape]);
  const lienSecondaire =
    'min-h-11 rounded-lg px-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:text-muted-foreground disabled:no-underline';
  return (
    // TCK-2460 — la hauteur des champs vient de la portée de densité (44 px), jamais d'un `h-*` ici.
    <div className="space-y-3 lg:max-w-md" data-testid="booking-identity" {...fieldDensityScope()}>
      {identite.etape === 'numero' ? (
        <div className="space-y-1.5">
          <label htmlFor="booking-telephone" className="block text-[0.9375rem] font-medium">
            {t('phoneLabel')}
          </label>
          <p className="text-pretty text-sm text-muted-foreground">{t('phoneHelp')}</p>
          <PhoneInput
            id="booking-telephone"
            value={identite.telephone}
            onValueChange={identite.setTelephone}
            autoComplete="tel-national"
            required
          />
          {/* TCK-624 — un code envoyé à un numéro inconnu ouvre un compte : le consentement précède
              l'envoi. Il est porté par la case du récapitulatif (conditions ET confidentialité),
              qu'`agir()` exige avant `demanderCode` — une seule fois, pas deux mentions à la suite. */}
        </div>
      ) : (
        <div className="space-y-1.5">
          <label htmlFor="booking-code" className="block text-[0.9375rem] font-medium">
            {t('codeLabel')}
          </label>
          <p className="text-pretty text-sm text-muted-foreground">{t('codeSentTo', { phone: formaterTelephone(identite.telephone) })}</p>
          <Input
            id="booking-code"
            value={identite.code}
            onChange={(e) => identite.setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            placeholder="123456"
            className="tabular-nums tracking-widest"
            required
            ref={champDuCode}
          />
          {identite.apercu ? (
            <WarningBanner role="status" icon={<FlaskConical className="size-4" aria-hidden />} data-testid="code-de-preproduction">
              <p className="font-medium">{t('preview.title')}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  {t('preview.body')} <strong className="font-mono text-base tabular-nums tracking-widest">{identite.apercu}</strong>
                </span>
                <button
                  type="button"
                  className="min-h-11 rounded-lg px-2 font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
                  onClick={() => identite.setCode(identite.apercu ?? '')}
                >
                  {t('preview.use')}
                </button>
              </p>
            </WarningBanner>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" className={cn('-ml-2', lienSecondaire)} disabled={identite.enCours || identite.attente > 0} onClick={() => void identite.demanderCode()}>
              {identite.attente > 0 ? t('resendIn', { seconds: identite.attente }) : t('resend')}
            </button>
            <button type="button" className={cn('-mr-2 text-muted-foreground', lienSecondaire)} onClick={identite.changerDeNumero}>
              {t('changeNumber')}
            </button>
          </div>
        </div>
      )}
      {identite.erreur ? (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${identite.erreur}`)}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Le tunnel ne réserve que les séjours courts. Un bien au mois ou à l'année relève du bail
 * (features §1.4) : ni dates, ni montant, ni invitation à se connecter — l'agent, par la visite ou
 * WhatsApp (décisions 3a, 4a). Une vente se traite par une offre, depuis la fiche.
 */
/** Le contact du bien : le contact principal (TCK-603), à défaut le propriétaire. */
function contactDuBien(property: PropertyDetail) {
  return property.primary_contact ?? property.owner ?? null;
}

/**
 * Le profil d'agent vers lequel renvoyer, d'après le CONTACT (pas d'après le propriétaire) : un
 * propriétaire-agent dont le bien est suivi par un autre contact n'est pas celui qu'on joint.
 */
function slugDAgent(contact: ReturnType<typeof contactDuBien>): string | null {
  return contact?.is_agent && contact.slug ? contact.slug : null;
}

function HorsSejourCourt({ property, vente }: { readonly property: PropertyDetail; readonly vente: boolean }) {
  const t = useTranslations('bookings.tunnel');
  const contact = contactDuBien(property);
  const agentSlug = slugDAgent(contact);
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <EmptyState
        data-testid="booking-long-term"
        icon={vente ? <Tag className="size-8" aria-hidden /> : <CalendarRange className="size-8" aria-hidden />}
        title={vente ? t('sale.title') : t('longTerm.title')}
        description={vente ? t('sale.description') : t('longTerm.description')}
        action={
          <div className="flex flex-col-reverse justify-center gap-2 sm:flex-row">
            {!vente && agentSlug ? (
              <Button variant="outline" size="lg" className="h-11 px-4" nativeButton={false} render={<LienLocalise href={`/agents/${agentSlug}`} />}>
                {t('longTerm.contact')}
              </Button>
            ) : null}
            {!vente && contact?.has_whatsapp === true ? (
              <WhatsAppButton slug={property.slug} title={property.title} hasWhatsApp className="h-11 min-h-11 gap-2 px-4 py-0 text-sm">
                {t('longTerm.whatsapp')}
              </WhatsAppButton>
            ) : null}
            <Button size="lg" className="h-11 px-4" nativeButton={false} render={<LienLocalise href={`/properties/${property.slug}`} />}>
              {vente ? t('sale.cta') : t('longTerm.visit')}
            </Button>
          </div>
        }
      />
    </div>
  );
}
