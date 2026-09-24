'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import type { ZodType } from 'zod';
import { CalendarRange, CheckCircle2 } from 'lucide-react';
import { EmptyState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { FormInput, FormTextarea, FormCheckbox, FormGlobalError, FormDatePicker } from '@/components/forms';
import { useAuth } from '@/context/AuthContext';
import { useCreateBooking } from '@/lib/queries/bookings';
import { ApiError } from '@/lib/api';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import {
  mapValidationErrorsToForm,
  useResolveurValidation,
} from '@/hooks/useApiForm';
import { bookingRequestSchema, type BookingRequestFormValues } from '@/lib/schemas/booking';
import { formatCurrency } from '@/lib/format';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { quoteBooking } from '@/lib/booking-quote';
import type { Locale } from '@/i18n/config';
import type { PropertyDetail } from '@/types/property';
import type { Booking } from '@/types/booking';
import { BookingStepper, type BookingStep } from './BookingStepper';
import { BookingSummary } from './BookingSummary';

/**
 * Cibles d'au moins 44 px sur tout le tunnel : c'est une page publique, lue au doigt
 * (revue design 2026-09-16, même réglage que les états vides publics du groupe B).
 */
const CTA = 'h-11 px-4';

interface BookingTunnelProps {
  readonly property: PropertyDetail;
}

/**
 * TCK-292 — la table hors composant transporte la CLÉ (relative à `bookings.tunnel`) ;
 * `BookingStepper` reçoit des libellés déjà résolus.
 */
const STEP_KEYS = ['dates', 'review', 'terms', 'done'] as const;
const STEP_COUNT = STEP_KEYS.length;

const FIELDS_PER_STEP: Record<number, readonly (keyof BookingRequestFormValues)[]> = {
  0: ['start_date', 'end_date', 'guests'],
  1: ['notes'],
  2: ['accept_terms'],
};

/**
 * Multi-step reservation tunnel.
 *
 * State machine is local — `useForm` owns the values, a `stepIndex` drives
 * the UI. Submission only happens on step 2 → 3 transition (the "Soumettre"
 * button on the Conditions step). Each step validates its own subset of
 * fields before letting the user advance.
 */
export function BookingTunnel({ property }: BookingTunnelProps) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const locale = useLocale() as Locale;
  const t = useTranslations('bookings.tunnel');
  const messageErreur = useMessageErreurApi();
  const tBookings = useTranslations('bookings');
  const fmt = useFormatteurs();
  const [stepIndex, setStepIndex] = useState(0);
  const [createdBooking, setCreatedBooking] = useState<Booking | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Le cast reproduit celui que portait `zodResolver` ici même : `bookingRequestSchema` a des
  // champs à `.default()`, donc son `z.input` diffère de son `z.output` et ne s'unifie pas avec
  // `BookingRequestFormValues`. Il porte sur l'ARGUMENT, jamais sur le paramètre de type — sans quoi le
  // résolveur retomberait sur `FieldValues` et `useForm` refuserait le branchement.
  const resolver = useResolveurValidation<BookingRequestFormValues>(
    bookingRequestSchema as unknown as ZodType<BookingRequestFormValues>,
  );
  const form = useForm<BookingRequestFormValues>({
    // `useResolveurValidation`, PAS `zodResolver` nu : les schémas de `src/lib/schemas/` portent
    // une clé (`validation.…`) et non un libellé. Ce fichier montait `zodResolver` directement et
    // rendait donc la clé brute à l'utilisateur — l'inventaire du lot J l'avait manqué alors même
    // qu'il cherchait `zodResolver` (TCK-292, lot L).
    resolver,
    defaultValues: {
      property_id: property.id,
      start_date: '',
      end_date: '',
      guests: 1,
      notes: '',
      accept_terms: false,
    },
    mode: 'onBlur',
  });

  const createBooking = useCreateBooking();

  const steps: readonly BookingStep[] = STEP_KEYS.map((key) => ({
    key,
    label: t(`steps.${key}`),
  }));

  // `useWatch` et non `form.watch()` : le React Compiler ne sait pas mémoïser `watch` et
  // renonçait à compiler tout le tunnel (`react-hooks/incompatible-library`).
  const watched = useWatch({ control: form.control });
  const startDate = watched.start_date;
  const endDate = watched.end_date;
  const guests = watched.guests;
  const nights = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const s = new Date(startDate);
    const e = new Date(endDate);
    const diff = Math.round((e.getTime() - s.getTime()) / 86_400_000);
    return Math.max(0, diff);
  }, [startDate, endDate]);

  // TCK-530 — le total dépend de `rent_period` : il multipliait le loyer par les nuits quelle que
  // soit sa période (250 000 F / mois × 10 nuits = 2 500 000 F). Estimation d'affichage : le
  // serveur recalcule, et rien de ce qui suit ne lui est envoyé.
  const quote = quoteBooking(property, nights);
  const totalAmount = quote.kind === 'long_term' ? 0 : quote.total;
  const depositAmount = quote.kind === 'long_term' ? 0 : quote.deposit;
  const money = (value: number) => formatCurrency(value, locale, { currency: property.currency ?? 'XOF' });

  async function handleNext() {
    setGlobalError(null);
    const fields = FIELDS_PER_STEP[stepIndex] ?? [];
    const valid = await form.trigger(fields as Parameters<typeof form.trigger>[0]);
    if (!valid) return;

    if (stepIndex < STEP_COUNT - 2) {
      setStepIndex(stepIndex + 1);
      return;
    }

    // Step 2 → submit
    if (!user) {
      const redirect = `/bookings?property=${property.slug}`;
      router.push(`/auth/login?redirect=${encodeURIComponent(redirect)}`);
      return;
    }

    const values = form.getValues();
    try {
      const result = await createBooking.mutateAsync({
        property_id: property.id,
        start_date: values.start_date,
        end_date: values.end_date,
        guests: values.guests,
        notes: values.notes,
      });
      setCreatedBooking(result.data);
      setStepIndex(STEP_COUNT - 1);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.validationErrors) {
        // Seuls les champs qu'une étape AFFICHE reçoivent leur erreur. `property_id` est une valeur
        // du formulaire sans saisie : le refus de l'API sur lui (bien passé au mois entre-temps,
        // TCK-530) s'y posait sans que rien ne le montre, et le bouton restait sans effet.
        const known = Object.values(FIELDS_PER_STEP).flat();
        const unknown = mapValidationErrorsToForm(err.validationErrors, form, known);
        if (unknown.length > 0) setGlobalError(unknown.join(' '));
        // Retour à la première étape fautive. Lue sur la RÉPONSE, pas sur `form.formState.errors` :
        // ce proxy n'est pas abonné hors rendu et rendait `{}` ici — un refus sur `end_date`
        // laissait l'utilisateur sur l'étape des conditions, sans rien afficher (TCK-530).
        const owner = Object.entries(FIELDS_PER_STEP).find(([, fs]) =>
          fs.some((field) => field in (err.validationErrors ?? {})),
        );
        if (owner) setStepIndex(Number(owner[0]));
      } else {
        setGlobalError(messageErreur(err, t('error')));
      }
    }
  }

  function handleBack() {
    setGlobalError(null);
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  }

  // TCK-530 — un bien au mois ou à l'année relève du bail (features §1.4) : ni dates, ni montant,
  // ni invitation à se connecter pour une demande que l'API refuserait.
  if (quote.kind === 'long_term') {
    const agentSlug = property.owner?.is_agent ? property.owner.slug : null;
    return (
      <EmptyState
        data-testid="booking-long-term"
        icon={<CalendarRange className="size-8" aria-hidden="true" />}
        title={t('longTerm.title')}
        description={t('longTerm.description')}
        action={
          <div className="flex flex-col-reverse justify-center gap-2 sm:flex-row">
            {/* Sans profil d'agent public, le contact vit sur la fiche : un second bouton vers la
                même adresse ne ferait que dédoubler le premier. */}
            {agentSlug && (
              <Button
                variant="outline"
                size="lg"
                className={CTA}
                nativeButton={false}
                render={<Link href={`/properties/${property.slug}`} />}
              >
                {t('backToProperty')}
              </Button>
            )}
            <Button
              size="lg"
              className={CTA}
              nativeButton={false}
              render={<Link href={agentSlug ? `/agents/${agentSlug}` : `/properties/${property.slug}`} />}
            >
              {t('longTerm.contact')}
            </Button>
          </div>
        }
      />
    );
  }

  // Auth redirect prompt — login first, come back to the tunnel.
  if (!authLoading && !user) {
    const redirect = `/bookings?property=${property.slug}`;
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center sm:p-8">
        <h2 className="text-balance font-display text-xl font-semibold tracking-tight text-foreground">
          {t('auth.title')}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-pretty text-sm text-muted-foreground">
          {t('auth.description')}
        </p>
        {/* Sous `sm`, l'action principale passe en tête et les deux boutons prennent la largeur. */}
        <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row">
          <Button
            variant="outline"
            size="lg"
            className={CTA}
            nativeButton={false}
            render={<Link href={`/properties/${property.slug}`} />}
          >
            {t('backToProperty')}
          </Button>
          <Button
            size="lg"
            className={CTA}
            nativeButton={false}
            render={<Link href={`/auth/login?redirect=${encodeURIComponent(redirect)}`} />}
          >
            {t('auth.login')}
          </Button>
        </div>
      </div>
    );
  }

  // Success screen
  if (stepIndex === STEP_COUNT - 1 && createdBooking) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center sm:p-8">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-success/10">
          <CheckCircle2 className="size-8 text-success" aria-hidden />
        </span>
        <h2 className="mt-4 text-balance font-display text-xl font-semibold tracking-tight text-foreground">
          {t('success.title')}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-pretty text-sm text-muted-foreground">
          {t.rich('success.body', {
            title: property.title,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
        {/* TCK-575 — le texte promettait « sous 48h » en dur. Le délai est PAR AGENCE (1 à 168 h,
            ou désactivé), et une seconde échéance s'applique à la demande elle-même : l'API rend
            la première des deux (`response_deadline`), et c'est elle qu'on affiche. Sans
            échéance, aucun chiffre — rien ne serait tenu. */}
        <p data-testid="booking-success-deadline" className="mx-auto mt-2 max-w-md text-pretty text-sm text-muted-foreground">
          {createdBooking.response_deadline
            ? t.rich('success.deadline', {
                date: fmt.dateTime(createdBooking.response_deadline, { dateStyle: 'full', timeStyle: 'short' }),
                strong: (chunks) => <strong className="text-foreground">{chunks}</strong>,
              })
            : t('success.noDeadline')}
        </p>
        <dl className="mx-auto mt-4 max-w-sm space-y-1 rounded-lg bg-muted p-4 text-sm text-foreground">
          {createdBooking.reference_number && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t('success.reference')}</dt>
              <dd className="font-mono">{createdBooking.reference_number}</dd>
            </div>
          )}
          {/* Le montant ENREGISTRÉ, tel que l'API le rend — pas l'estimation du front, qui ne lui
              est jamais envoyée (vérification adverse de TCK-530). */}
          {createdBooking.total_amount !== null && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t('success.total')}</dt>
              <dd className="font-semibold tabular-nums" data-testid="booking-success-total">
                {formatCurrency(createdBooking.total_amount, locale, {
                  currency: createdBooking.currency ?? property.currency ?? 'XOF',
                })}
              </dd>
            </div>
          )}
        </dl>
        <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row">
          <Button
            variant="outline"
            size="lg"
            className={CTA}
            nativeButton={false}
            render={<Link href={`/properties/${property.slug}`} />}
          >
            {t('backToProperty')}
          </Button>
          <Button
            size="lg"
            className={CTA}
            nativeButton={false}
            render={<Link href={`/app/bookings/${createdBooking.id}`} />}
          >
            {t('success.viewBooking')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        <BookingStepper steps={steps} currentIndex={stepIndex} />
        <div className="mt-6 rounded-xl border border-border bg-card p-4 sm:p-6">
          <FormGlobalError>{globalError}</FormGlobalError>

          {stepIndex === 0 && (
            <div className="space-y-4">
              <h2 className="text-balance font-display text-lg font-semibold tracking-tight text-foreground">{t('step1.title')}</h2>
              <p className="text-pretty text-sm text-muted-foreground">{t('step1.description')}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormDatePicker<BookingRequestFormValues>
                  control={form.control}
                  name="start_date"
                  label={t('fields.startDate')}
                  required
                  min={new Date().toISOString().slice(0, 10)}
                  placeholder={t('fields.startDatePlaceholder')}
                />
                <FormDatePicker<BookingRequestFormValues>
                  control={form.control}
                  name="end_date"
                  label={t('fields.endDate')}
                  required
                  min={startDate || new Date().toISOString().slice(0, 10)}
                  placeholder={t('fields.endDatePlaceholder')}
                />
              </div>
              <FormInput<BookingRequestFormValues>
                control={form.control}
                name="guests"
                type="number"
                label={t('fields.guests')}
                required
                min={1}
                max={20}
              />
            </div>
          )}

          {stepIndex === 1 && (
            <div className="space-y-4">
              <h2 className="text-balance font-display text-lg font-semibold tracking-tight text-foreground">{t('steps.review')}</h2>
              <p className="text-pretty text-sm text-muted-foreground">{t('step2.description')}</p>
              {/* Libellé en `min-w-0`, montant insécable : à 360, « 41 280 000 F CFA » passait
                  sur deux lignes à côté d'un libellé qui en prenait deux aussi. */}
              <div className="space-y-2 rounded-lg bg-muted p-4 text-sm tabular-nums">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-muted-foreground" data-testid="booking-price-line">
                    {quote.kind === 'stay' && quote.period === 'weekly' && quote.nights > 0
                      ? t('weeklyLine', {
                          price: money(property.price),
                          nights: tBookings('summary.nights', { count: quote.nights }),
                        })
                      : money(property.price)}
                    {quote.kind === 'stay' && quote.period === 'daily' && quote.nights > 0 &&
                      ` × ${tBookings('summary.nights', { count: quote.nights })}`}
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-foreground" data-testid="booking-total">
                    {money(totalAmount)}
                  </span>
                </div>
                <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                  <span>{t('guestsLabel')}</span>
                  <span>{guests}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2 font-semibold text-foreground">
                  <span className="min-w-0">{t('depositLabel')}</span>
                  <span className="shrink-0 whitespace-nowrap" data-testid="booking-deposit">{money(depositAmount)}</span>
                </div>
              </div>
              <FormTextarea<BookingRequestFormValues>
                control={form.control}
                name="notes"
                label={t('notesLabel')}
                rows={4}
                placeholder={t('notesPlaceholder')}
              />
            </div>
          )}

          {stepIndex === 2 && (
            <div className="space-y-4">
              <h2 className="text-balance font-display text-lg font-semibold tracking-tight text-foreground">{t('steps.terms')}</h2>
              <div className="space-y-2 rounded-lg border border-border bg-muted p-4 text-pretty text-sm text-foreground">
                <p>{t('terms.body')}</p>
                <p>
                  {t.rich('terms.deposit', {
                    amount: money(depositAmount),
                    strong: (chunks) => <strong className="tabular-nums">{chunks}</strong>,
                  })}
                </p>
              </div>
              <FormCheckbox<BookingRequestFormValues>
                control={form.control}
                name="accept_terms"
                label={t('terms.accept')}
                required
              />
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className={CTA}
              onClick={handleBack}
              disabled={stepIndex === 0 || createBooking.isPending}
            >
              {t('actions.back')}
            </Button>
            <Button
              type="button"
              size="lg"
              className={CTA}
              onClick={handleNext}
              disabled={createBooking.isPending}
            >
              {createBooking.isPending
                ? t('actions.submitting')
                : stepIndex === STEP_COUNT - 2
                  ? t('actions.submit')
                  : t('actions.continue')}
            </Button>
          </div>
        </div>
      </div>

      <BookingSummary
        property={property}
        startDate={startDate || undefined}
        endDate={endDate || undefined}
        nights={nights}
        totalAmount={totalAmount}
        depositAmount={depositAmount}
      />
    </div>
  );
}
