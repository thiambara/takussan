'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  useBooking,
  useCancelBooking,
  useConfirmBooking,
  useCreateBookingPayment,
  useRejectBooking,
} from '@/lib/queries/bookings';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { ErrorState } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { isAgent, isAdmin, isOwner } from '@/lib/roles';
import type { Locale } from '@/i18n/config';
import type { Booking, BookingStatus } from '@/types/booking';
import { BookingPaymentDialog } from './BookingPaymentDialog';
import { PayOnlineButton } from '@/components/payments/PayOnlineButton';
import { usePaymentProviders } from '@/hooks/usePaymentProviders';
import { LeaveReviewCta } from '@/components/reviews/LeaveReviewCta';
import { canBookingLeaveReview } from '@/components/reviews/reviewEligibility';
import type { GatewayProvider } from '@/hooks/useInitiatePayment';

const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: 'En attente',
  confirmed: 'Confirmée',
  rejected: 'Refusée',
  cancelled: 'Annulée',
  expired: 'Expirée',
  completed: 'Terminée',
};

const STATUS_VARIANT: Record<BookingStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'outline',
  confirmed: 'default',
  rejected: 'destructive',
  cancelled: 'secondary',
  expired: 'secondary',
  completed: 'default',
};

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  deposit: 'Acompte',
  advance: 'Solde',
  fee: 'Frais',
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: 'En attente',
  paid: 'Payé',
  partially_paid: 'Partiel',
  refunded: 'Remboursé',
  cancelled: 'Annulé',
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: 'Espèces',
  bank_transfer: 'Virement',
  mobile_money: 'Mobile money',
  card: 'Carte',
};

interface BookingDetailProps {
  readonly bookingId: number;
}

export function BookingDetail({ bookingId }: BookingDetailProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('bookings.detail');
  const tCommon = useTranslations('common');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [action, setAction] = useState<'confirm' | 'reject' | 'cancel' | null>(null);
  const bookingQuery = useBooking(bookingId);
  const { data, isLoading, isError } = bookingQuery;
  const { user } = useAuth();
  const agencyId = data?.data?.agency_id ?? null;
  const { providers } = usePaymentProviders(agencyId);
  const cancelBooking = useCancelBooking(bookingId);
  const confirmBooking = useConfirmBooking(bookingId);
  const rejectBooking = useRejectBooking(bookingId);
  const isDashboardAgent = user ? isAgent(user.roles) || isAdmin(user.roles) || isOwner(user.roles) : false;
  const toast = useToast();

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded-xl bg-app-surface-1" />;
  }

  if (isError || !data) {
    return (
      <ErrorState
        message={t('error')}
        onRetry={() => void bookingQuery.refetch()}
        retryLabel={tCommon('actions.retry')}
      />
    );
  }

  const booking = data.data;
  const isCustomer =
    !!user?.id && !!booking.customer && user.id === booking.customer.user_id;
  const canCancel =
    (isCustomer || isDashboardAgent) &&
    (booking.status === 'pending' || booking.status === 'confirmed');
  const canConfirm = isDashboardAgent && booking.status === 'pending';
  const canReject = isDashboardAgent && booking.status === 'pending';
  const canRegisterPayment = isDashboardAgent;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/app/bookings"
            className="text-xs text-stone-500 hover:text-stone-700"
          >
            ← Retour aux réservations
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-app-ink">
            {booking.property?.title ?? `Réservation #${booking.id}`}
          </h1>
          <div className="mt-2 flex items-center gap-2 text-xs text-stone-500">
            <Badge variant={STATUS_VARIANT[booking.status]}>
              {STATUS_LABEL[booking.status]}
            </Badge>
            {booking.reference_number && <span>Réf. {booking.reference_number}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {canConfirm && (
            <Button type="button" onClick={() => setAction('confirm')}>
              Accepter
            </Button>
          )}
          {canReject && (
            <Button type="button" variant="outline" onClick={() => setAction('reject')}>
              Refuser
            </Button>
          )}
          {canRegisterPayment && (
            <Button variant="outline" onClick={() => setPaymentOpen(true)}>
              Enregistrer un paiement
            </Button>
          )}
          {canCancel && (
            <Button
              variant="ghost"
              onClick={() => setAction('cancel')}
              disabled={cancelBooking.isPending}
              className="text-red-600 hover:text-red-700"
            >
              Annuler la réservation
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <dl className="rounded-xl border border-stone-200 bg-white p-5 text-sm">
          <dt className="text-xs uppercase tracking-wide text-stone-500">Dates</dt>
          <dd className="mt-1 text-stone-900">
            {booking.start_date && booking.end_date ? (
              <>
                {formatDate(booking.start_date, locale)} → {formatDate(booking.end_date, locale)}
              </>
            ) : (
              '—'
            )}
          </dd>

          <dt className="mt-4 text-xs uppercase tracking-wide text-stone-500">Créée le</dt>
          <dd className="mt-1 text-stone-900">{formatDateTime(booking.created_at ?? booking.booking_date, locale) || '—'}</dd>

          {booking.expiration_date && (
            <>
              <dt className="mt-4 text-xs uppercase tracking-wide text-stone-500">
                Expire le
              </dt>
              <dd className="mt-1 text-stone-900">
                {formatDateTime(booking.expiration_date, locale)}
              </dd>
            </>
          )}
        </dl>

        <dl className="rounded-xl border border-stone-200 bg-white p-5 text-sm">
          <dt className="text-xs uppercase tracking-wide text-stone-500">Total</dt>
          <dd className="mt-1 text-lg font-semibold text-stone-900">
            {typeof booking.total_amount === 'number'
              ? formatCurrency(booking.total_amount, locale)
              : '—'}
          </dd>

          <dt className="mt-4 text-xs uppercase tracking-wide text-stone-500">Acompte</dt>
          <dd className="mt-1 text-stone-900">
            {typeof booking.deposit_amount === 'number'
              ? formatCurrency(booking.deposit_amount, locale)
              : '—'}
            {booking.deposit_paid && (
              <Badge variant="default" className="ml-2">
                Payé
              </Badge>
            )}
          </dd>
        </dl>
      </div>

      {booking.notes && (
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-stone-900">Message</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-stone-700">{booking.notes}</p>
        </div>
      )}

      {!isDashboardAgent && canBookingLeaveReview(booking) && booking.property?.slug && (
        <LeaveReviewCta
          slug={booking.property.slug}
          context="Votre séjour est terminé."
          propertyTitle={booking.property.title}
        />
      )}

      {isCustomer && (
        <CustomerPayCta
          bookingId={bookingId}
          booking={booking}
          providers={providers}
        />
      )}

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-stone-900">Paiements</h2>
        {booking.booking_payments && booking.booking_payments.length > 0 ? (
          <ul className="mt-3 divide-y divide-stone-100 text-sm">
            {booking.booking_payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-stone-600">
                  {formatDateTime(p.payment_date ?? p.created_at, locale)} ·{' '}
                  {PAYMENT_TYPE_LABEL[p.payment_type] ?? p.payment_type}
                  {p.payment_method ? (
                    <> · {PAYMENT_METHOD_LABEL[p.payment_method] ?? p.payment_method}</>
                  ) : null}
                  {p.transaction_id ? <> · Réf. {p.transaction_id}</> : null}
                </span>
                <span className="flex items-center gap-2 text-stone-900">
                  <span className="font-medium">
                    {formatCurrency(p.amount, locale)}
                  </span>
                  <Badge variant={p.status === 'paid' ? 'default' : 'outline'}>
                    {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                  </Badge>
                  {p.status === 'pending' && (
                    <PayOnlineButton
                      paymentType="booking-payments"
                      paymentId={p.id}
                      currency={p.currency}
                      availableProviders={providers}
                    />
                  )}
                  {p.status === 'paid' && (
                    <a
                      href={`/api/booking-payments/${p.id}/receipt`}
                      className="text-xs text-app-accent hover:underline"
                    >
                      Quittance PDF
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-stone-500">
            Aucun paiement enregistré pour l&apos;instant.
          </p>
        )}
      </section>

      <BookingTimeline booking={booking} locale={locale} />

      <BookingPaymentDialog
        bookingId={bookingId}
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
      />
      <BookingDecisionDialog
        action={action}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
        pending={
          confirmBooking.isPending ||
          rejectBooking.isPending ||
          cancelBooking.isPending
        }
        onSubmit={async (reason) => {
          if (action === 'confirm') {
            await confirmBooking.mutateAsync();
            toast.add({
              title: 'Réservation acceptée',
              description: 'Le statut est maintenant confirmé.',
              type: 'success',
            });
          }
          if (action === 'reject') {
            await rejectBooking.mutateAsync({ reason });
            toast.add({
              title: 'Réservation refusée',
              description: 'Le motif est enregistré pour le client.',
              type: 'success',
            });
          }
          if (action === 'cancel') {
            await cancelBooking.mutateAsync({ reason });
            toast.add({
              title: 'Réservation annulée',
              description: 'Le motif est enregistré dans l’historique.',
              type: 'success',
            });
          }
          setAction(null);
        }}
      />
    </div>
  );
}

function BookingDecisionDialog({
  action,
  pending,
  onOpenChange,
  onSubmit,
}: {
  action: 'confirm' | 'reject' | 'cancel' | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason?: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const open = action !== null;
  const isReasonRequired = action === 'reject' || action === 'cancel';
  const copy = action ? ACTION_COPY[action] : null;

  async function handleSubmit() {
    if (isReasonRequired && reason.trim().length === 0) return;
    await onSubmit(reason.trim() || undefined);
    setReason('');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy?.title}</DialogTitle>
          <DialogDescription>{copy?.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor="booking-action-reason" className="text-xs font-medium text-stone-600">
            {copy?.label}
          </label>
          <Textarea
            id="booking-action-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            placeholder={copy?.placeholder}
            required={isReasonRequired}
          />
          {isReasonRequired && reason.trim().length === 0 ? (
            <p className="text-xs text-stone-500">Un motif est requis pour cette action.</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={pending || (isReasonRequired && reason.trim().length === 0)}
          >
            {pending ? 'Traitement…' : copy?.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ACTION_COPY = {
  confirm: {
    title: 'Accepter la réservation',
    description: 'Le client recevra la confirmation via le workflow de réservation.',
    label: 'Message au client (optionnel)',
    placeholder: 'Ex. Votre réservation est confirmée, nous vous attendons.',
    submit: 'Accepter',
  },
  reject: {
    title: 'Refuser la réservation',
    description: 'Expliquez clairement pourquoi la demande ne peut pas être acceptée.',
    label: 'Motif du refus',
    placeholder: 'Ex. Le logement n’est plus disponible sur ces dates.',
    submit: 'Refuser',
  },
  cancel: {
    title: 'Annuler la réservation',
    description: 'Cette action annule une demande ouverte ou confirmée.',
    label: 'Motif d’annulation',
    placeholder: 'Ex. Indisponibilité exceptionnelle du logement.',
    submit: 'Annuler la réservation',
  },
} as const;

function CustomerPayCta({
  bookingId,
  booking,
  providers,
}: {
  bookingId: number;
  booking: Booking;
  providers: readonly GatewayProvider[] | undefined;
}) {
  const createPayment = useCreateBookingPayment(bookingId);
  const payments = booking.booking_payments ?? [];
  const hasPending = payments.some((p) => p.status === 'pending');

  // Don't show the CTA if there's already a pending payment row — the user
  // can pay it via the existing PayOnlineButton just below.
  if (hasPending) return null;

  if (booking.status !== 'pending' && booking.status !== 'confirmed') return null;
  if (providers !== undefined && providers.length === 0) return null;

  const succeededTotal = payments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  const total = Number(booking.total_amount ?? 0);
  const remaining = Math.max(total - succeededTotal, 0);
  if (remaining <= 0) return null;

  const depositAmount = Number(booking.deposit_amount ?? 0);
  const isDepositStep = succeededTotal === 0 && depositAmount > 0;
  const amount = isDepositStep ? depositAmount : remaining;
  const paymentType: 'deposit' | 'advance' = isDepositStep ? 'deposit' : 'advance';
  const label = isDepositStep ? 'Payer l’acompte' : 'Payer le solde';

  async function handleClick() {
    await createPayment.mutateAsync({
      amount,
      payment_type: paymentType,
      status: 'pending',
    });
  }

  return (
    <section className="rounded-xl border border-app-border bg-app-surface-1 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-stone-900">{label}</h2>
          <p className="mt-1 text-xs text-stone-500">
            Vous serez redirigé vers la passerelle de paiement (Wave, Orange Money, carte).
          </p>
        </div>
        <Button onClick={handleClick} disabled={createPayment.isPending}>
          {label}
        </Button>
      </div>
    </section>
  );
}

type TimelineEvent = { label: string; at: string };

function BookingTimeline({ booking, locale }: { booking: Booking; locale: Locale }) {
  const events: TimelineEvent[] = [];
  if (booking.created_at) events.push({ label: 'Créée', at: booking.created_at });
  const confirmedAt = booking.confirmed_at ?? booking.confirmation_date;
  if (confirmedAt) events.push({ label: 'Confirmée', at: confirmedAt });
  if (booking.deposit_paid && booking.deposit_date) {
    events.push({ label: 'Acompte payé', at: booking.deposit_date });
  }
  if (booking.completion_date) events.push({ label: 'Soldée', at: booking.completion_date });
  const cancelledAt = booking.cancelled_at ?? booking.cancellation_date;
  if (cancelledAt) events.push({ label: 'Annulée', at: cancelledAt });
  if (booking.rejection_date) events.push({ label: 'Refusée', at: booking.rejection_date });
  const expiredAt = booking.expired_at ?? booking.expires_at ?? booking.expiration_date;
  if (expiredAt && booking.status === 'expired') {
    events.push({ label: 'Expirée', at: expiredAt });
  }

  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  if (events.length === 0) return null;

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-stone-900">Historique</h2>
      <ol className="mt-3 space-y-2 text-sm">
        {events.map((e) => (
          <li key={`${e.label}-${e.at}`} className="flex items-baseline gap-3">
            <span className="size-1.5 shrink-0 rounded-full bg-stone-400" aria-hidden="true" />
            <span className="text-stone-900 font-medium">{e.label}</span>
            <span className="text-xs text-stone-500">
              {formatDateTime(e.at, locale)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
