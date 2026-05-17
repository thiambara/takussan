'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormInput, FormTextarea, FormCheckbox, FormGlobalError, FormDatePicker } from '@/components/forms';
import { useAuth } from '@/context/AuthContext';
import { useCreateBooking } from '@/lib/queries/bookings';
import { ApiError } from '@/lib/api';
import { extractApiErrorMessage, mapValidationErrorsToForm } from '@/hooks/useApiForm';
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

const STEPS: readonly BookingStep[] = [
  { key: 'dates', label: 'Dates' },
  { key: 'review', label: 'Récapitulatif' },
  { key: 'terms', label: 'Conditions' },
  { key: 'done', label: 'Confirmation' },
];

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
  const [stepIndex, setStepIndex] = useState(0);
  const [createdBooking, setCreatedBooking] = useState<Booking | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const form = useForm<BookingRequestFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(bookingRequestSchema as unknown as any),
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

    if (stepIndex < STEPS.length - 2) {
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
      setStepIndex(STEPS.length - 1);
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
        setGlobalError(extractApiErrorMessage(err, 'La réservation a échoué. Réessayez.'));
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
          Connectez-vous pour réserver
        </h2>
        <p className="mt-2 text-sm text-stone-600">
          Vous devez être connecté pour finaliser la demande de réservation.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/properties/${property.slug}`} />}
          >
            Retour au bien
          </Button>
          <Button
            nativeButton={false}
            render={<Link href={`/auth/login?redirect=${encodeURIComponent(redirect)}`} />}
          >
            Se connecter
          </Button>
        </div>
      </div>
    );
  }

  // Success screen
  if (stepIndex === STEPS.length - 1 && createdBooking) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <CheckCircle2 className="mx-auto size-12 text-emerald-600" aria-hidden />
        <h2 className="mt-4 text-xl font-semibold text-emerald-900">
          Demande envoyée !
        </h2>
        <p className="mt-2 text-sm text-emerald-800">
          Votre demande de réservation pour <strong>{property.title}</strong> a bien été
          enregistrée. Le propriétaire ou l&apos;agent vous recontactera sous 48h.
        </p>
        <dl className="mx-auto mt-4 max-w-sm space-y-1 text-sm text-emerald-900">
          {createdBooking.reference_number && (
            <div className="flex justify-between">
              <dt className="text-emerald-700">Référence</dt>
              <dd className="font-mono">{createdBooking.reference_number}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-emerald-700">Total estimé</dt>
            <dd className="font-semibold">{formatCurrency(totalAmount, locale)}</dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/properties/${property.slug}`} />}
          >
            Retour au bien
          </Button>
          <Button
            nativeButton={false}
            render={<Link href={`/app/bookings/${createdBooking.id}`} />}
          >
            Voir ma réservation
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        <BookingStepper steps={STEPS} currentIndex={stepIndex} />
        <div className="mt-6 rounded-xl border border-stone-200 bg-white p-6">
          <FormGlobalError>{globalError}</FormGlobalError>

          {stepIndex === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-stone-900">Vos dates</h2>
              <p className="text-sm text-stone-600">
                Sélectionnez votre période et le nombre de voyageurs.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormDatePicker<BookingRequestFormValues>
                  control={form.control}
                  name="start_date"
                  label="Arrivée"
                  required
                  min={new Date().toISOString().slice(0, 10)}
                  placeholder="Date d'arrivée"
                />
                <FormDatePicker<BookingRequestFormValues>
                  control={form.control}
                  name="end_date"
                  label="Départ"
                  required
                  min={startDate || new Date().toISOString().slice(0, 10)}
                  placeholder="Date de départ"
                />
              </div>
              <FormInput<BookingRequestFormValues>
                control={form.control}
                name="guests"
                type="number"
                label="Nombre de personnes"
                required
                min={1}
                max={20}
              />
            </div>
          )}

          {stepIndex === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-stone-900">Récapitulatif</h2>
              <p className="text-sm text-stone-600">
                Vérifiez les montants et ajoutez un message au propriétaire si besoin.
              </p>
              <div className="rounded-lg bg-stone-50 p-4 text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-stone-600">
                    {formatCurrency(property.price, locale)}
                    {isRent && nights > 0 && ` × ${nights} nuit${nights > 1 ? 's' : ''}`}
                  </span>
                  <span className="text-stone-900">{formatCurrency(totalAmount, locale)}</span>
                </div>
                <div className="flex justify-between text-xs text-stone-600">
                  <span>Personnes</span>
                  <span>{guests}</span>
                </div>
                <div className="flex justify-between border-t border-stone-200 pt-2 font-semibold">
                  <span>Acompte (30 %)</span>
                  <span>{formatCurrency(depositAmount, locale)}</span>
                </div>
              </div>
              <FormTextarea<BookingRequestFormValues>
                control={form.control}
                name="notes"
                label="Message (optionnel)"
                rows={4}
                placeholder="Présentez-vous, expliquez votre projet…"
              />
            </div>
          )}

          {stepIndex === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-stone-900">Conditions</h2>
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700 space-y-2">
                <p>
                  En soumettant votre demande, vous acceptez que le propriétaire ou l&apos;agent
                  vous contacte pour confirmer la disponibilité. Aucun paiement n&apos;est
                  prélevé tant que la réservation n&apos;est pas confirmée.
                </p>
                <p>
                  Un acompte de{' '}
                  <strong>{formatCurrency(depositAmount, locale)}</strong> pourra être
                  demandé à la confirmation.
                </p>
              </div>
              <FormCheckbox<BookingRequestFormValues>
                control={form.control}
                name="accept_terms"
                label="J'accepte les conditions de réservation Takussan et la politique d'annulation."
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
              Retour
            </Button>
            <Button
              type="button"
              onClick={handleNext}
              disabled={createBooking.isPending}
            >
              {createBooking.isPending
                ? 'Envoi…'
                : stepIndex === STEPS.length - 2
                  ? 'Soumettre la demande'
                  : 'Continuer'}
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
