'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import type { ZodType } from 'zod';
import { CheckCircle2 } from 'lucide-react';
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
import type { Locale } from '@/i18n/config';
import type { PropertyDetail } from '@/types/property';
import type { Booking } from '@/types/booking';
import { BookingStepper, type BookingStep } from './BookingStepper';
import { BookingSummary } from './BookingSummary';

/** Fraction du total proposée en acompte dans le tunnel public (cf. features.md §1.3). */
const BOOKING_DEPOSIT_RATE = 0.3;

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

  const watched = form.watch();
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

  const isRent = property.contract_type === 'rent';
  const totalAmount = isRent && nights > 0 ? property.price * nights : property.price;
  // 30 % of total — règle stable documentée dans docs/features.md §1.3.
  // Si la règle devient variable (par bien / contrat), migrer vers un endpoint
  // backend `GET /api/bookings/quote` qui renverra `deposit_amount`.
  const depositAmount = Math.round(totalAmount * BOOKING_DEPOSIT_RATE);

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
        const known = Object.keys(form.getValues()) as (keyof BookingRequestFormValues)[];
        const unknown = mapValidationErrorsToForm(
          err.validationErrors,
          form,
          known as string[],
        );
        if (unknown.length > 0) setGlobalError(unknown.join(' '));
        // Jump back to first invalid step.
        const firstInvalid = Object.keys(form.formState.errors)[0];
        if (firstInvalid) {
          const owner = Object.entries(FIELDS_PER_STEP).find(([, fs]) =>
            (fs as string[]).includes(firstInvalid),
          );
          if (owner) setStepIndex(Number(owner[0]));
        }
      } else {
        setGlobalError(messageErreur(err, t('error')));
      }
    }
  }

  function handleBack() {
    setGlobalError(null);
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  }

  // Auth redirect prompt — login first, come back to the tunnel.
  if (!authLoading && !user) {
    const redirect = `/bookings?property=${property.slug}`;
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-8 text-center">
        <h2 className="text-lg font-semibold text-stone-900">
          {t('auth.title')}
        </h2>
        <p className="mt-2 text-sm text-stone-600">{t('auth.description')}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/properties/${property.slug}`} />}
          >
            {t('backToProperty')}
          </Button>
          <Button
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
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <CheckCircle2 className="mx-auto size-12 text-emerald-600" aria-hidden />
        <h2 className="mt-4 text-xl font-semibold text-emerald-900">
          {t('success.title')}
        </h2>
        <p className="mt-2 text-sm text-emerald-800">
          {t.rich('success.body', {
            title: property.title,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
        <dl className="mx-auto mt-4 max-w-sm space-y-1 text-sm text-emerald-900">
          {createdBooking.reference_number && (
            <div className="flex justify-between">
              <dt className="text-emerald-700">{t('success.reference')}</dt>
              <dd className="font-mono">{createdBooking.reference_number}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-emerald-700">{t('success.total')}</dt>
            <dd className="font-semibold">{formatCurrency(totalAmount, locale)}</dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/properties/${property.slug}`} />}
          >
            {t('backToProperty')}
          </Button>
          <Button
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
        <div className="mt-6 rounded-xl border border-stone-200 bg-white p-6">
          <FormGlobalError>{globalError}</FormGlobalError>

          {stepIndex === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-stone-900">{t('step1.title')}</h2>
              <p className="text-sm text-stone-600">{t('step1.description')}</p>
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
              <h2 className="text-lg font-semibold text-stone-900">{t('steps.review')}</h2>
              <p className="text-sm text-stone-600">{t('step2.description')}</p>
              <div className="rounded-lg bg-stone-50 p-4 text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-stone-600">
                    {formatCurrency(property.price, locale)}
                    {isRent && nights > 0 && ` × ${tBookings('summary.nights', { count: nights })}`}
                  </span>
                  <span className="text-stone-900">{formatCurrency(totalAmount, locale)}</span>
                </div>
                <div className="flex justify-between text-xs text-stone-600">
                  <span>{t('guestsLabel')}</span>
                  <span>{guests}</span>
                </div>
                <div className="flex justify-between border-t border-stone-200 pt-2 font-semibold">
                  <span>{t('depositLabel')}</span>
                  <span>{formatCurrency(depositAmount, locale)}</span>
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
              <h2 className="text-lg font-semibold text-stone-900">{t('steps.terms')}</h2>
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700 space-y-2">
                <p>{t('terms.body')}</p>
                <p>
                  {t.rich('terms.deposit', {
                    amount: formatCurrency(depositAmount, locale),
                    strong: (chunks) => <strong>{chunks}</strong>,
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

          <div className="mt-6 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={handleBack}
              disabled={stepIndex === 0 || createBooking.isPending}
            >
              {t('actions.back')}
            </Button>
            <Button
              type="button"
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
