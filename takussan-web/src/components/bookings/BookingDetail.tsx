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
import { useCanAll } from '@/hooks/useCan';
import { isAgent, isAdmin, isOwner } from '@/lib/roles';
import type { Locale } from '@/i18n/config';
import type { Booking, BookingStatus } from '@/types/booking';
import { BookingPaymentDialog } from './BookingPaymentDialog';
import { PayOnlineButton } from '@/components/payments/PayOnlineButton';
import { usePaymentProviders } from '@/hooks/usePaymentProviders';
import { LeaveReviewCta } from '@/components/reviews/LeaveReviewCta';
import { canBookingLeaveReview } from '@/components/reviews/reviewEligibility';
import type { GatewayProvider } from '@/hooks/useInitiatePayment';

/**
 * Listes figées hors composant : `useCanAll` mémoïse sur la RÉFÉRENCE du
 * tableau. Un littéral inline en recréerait une à chaque rendu et
 * recalculerait le verdict à chaque fois.
 */
const CAPABILITY_VALIDATE = ['bookings.validate'] as const;
const CAPABILITY_CANCEL = ['bookings.cancel'] as const;
const CAPABILITY_RECORD_PAYMENT = ['payments.record'] as const;

/**
 * TCK-292 — les quatre tables ci-dessous transportent la CLÉ (relative au namespace
 * `bookings`), le rendu la résout. `status.*` est le MÊME vocabulaire que `BookingsList.tsx`.
 */
const STATUS_LABEL_KEY: Record<BookingStatus, string> = {
  pending: 'status.pending',
  confirmed: 'status.confirmed',
  rejected: 'status.rejected',
  cancelled: 'status.cancelled',
  expired: 'status.expired',
  completed: 'status.completed',
};

const STATUS_VARIANT: Record<BookingStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'outline',
  confirmed: 'default',
  rejected: 'destructive',
  cancelled: 'secondary',
  expired: 'secondary',
  completed: 'default',
};

const PAYMENT_TYPE_LABEL_KEY: Record<string, string> = {
  deposit: 'paymentType.deposit',
  advance: 'paymentType.advance',
  fee: 'paymentType.fee',
};

const PAYMENT_STATUS_LABEL_KEY: Record<string, string> = {
  pending: 'paymentStatus.pending',
  paid: 'paymentStatus.paid',
  partially_paid: 'paymentStatus.partially_paid',
  refunded: 'paymentStatus.refunded',
  cancelled: 'paymentStatus.cancelled',
};

const PAYMENT_METHOD_LABEL_KEY: Record<string, string> = {
  cash: 'paymentMethod.cash',
  bank_transfer: 'paymentMethod.bank_transfer',
  mobile_money: 'paymentMethod.mobile_money',
  card: 'paymentMethod.card',
};

/** Clé de la copie du dialogue de décision, relative à `bookings.detail`. */
const ACTION_COPY_KEY = {
  confirm: 'decision.confirm',
  reject: 'decision.reject',
  cancel: 'decision.cancel',
} as const;

interface BookingDetailProps {
  readonly bookingId: number;
}

export function BookingDetail({ bookingId }: BookingDetailProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('bookings.detail');
  const tBookings = useTranslations('bookings');
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
  /**
   * TCK-279 (AC12) — « suis-je du côté tableau de bord ? » reste un test
   * d'APPARTENANCE : il pilote l'affichage (colonne agent contre colonne
   * client, invitation à laisser un avis), pas un verbe. Il garde donc
   * `isAgent`/`isAdmin`/`isOwner`, comme le prescrit le docblock de
   * `useCan`.
   */
  const isDashboardAgent = user ? isAgent(user.roles) || isAdmin(user.roles) || isOwner(user.roles) : false;
  /**
   * Les trois GESTES, eux, sont gardés par capacité. Un `agency_admin` dont
   * l'`AgencyRole` n'a pas `bookings.validate` voyait « Accepter » et
   * récoltait un 403 : depuis TCK-279, deux administrateurs de la même
   * agence peuvent porter des rôles différents, et le type de profil ne dit
   * plus ce qu'on a le droit de faire.
   *
   * ⚠️ Ceci n'autorise rien — `BookingPolicy` décide. Un bouton caché n'est
   * pas une sécurité, c'est une politesse.
   *
   * Trois appels de hook, UNE requête réseau : les trois partagent la clé
   * `['me','capabilities','active']`, donc TanStack Query n'en émet qu'une.
   * Trois verdicts nommés séparément valent mieux qu'un seul agrégé — le
   * nommage dit quelle capacité garde quel bouton.
   *
   * `enabled: isDashboardAgent` — cet écran sert aussi les CLIENTS, qui
   * n'ont aucune de ces capacités et pour qui la question ne se pose pas.
   * Sans cela, chaque consultation de réservation par un client tirerait une
   * requête pour une réponse vide.
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
  const toast = useToast();

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded-xl bg-card" />;
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
  // Tant que les capacités n'ont pas répondu, `can` vaut `false` : rendre le
  // bouton sur cette seule base le ferait DISPARAÎTRE puis réapparaître. On
  // laisse donc l'ancien verdict d'appartenance tenir pendant le chargement,
  // puis la capacité prend la main. Le serveur reste seul juge dans les deux
  // cas.
  const staffMay = (granted: boolean) =>
    isDashboardAgent && (capabilitiesLoading ? true : granted);

  const canCancel =
    (isCustomer || staffMay(canCancelBookings)) &&
    (booking.status === 'pending' || booking.status === 'confirmed');
  const canConfirm = staffMay(canValidateBookings) && booking.status === 'pending';
  const canReject = staffMay(canValidateBookings) && booking.status === 'pending';
  const canRegisterPayment = staffMay(canRecordPayments);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/app/bookings"
            className="text-xs text-muted-foreground hover:text-muted-foreground"
          >
            {t('back')}
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-foreground">
            {booking.property?.title ?? tBookings('fallbackTitle', { id: String(booking.id) })}
          </h1>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={STATUS_VARIANT[booking.status]}>
              {tBookings(STATUS_LABEL_KEY[booking.status])}
            </Badge>
            {booking.reference_number && <span>{tBookings('reference')} {booking.reference_number}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {canConfirm && (
            <Button type="button" onClick={() => setAction('confirm')}>
              {t('actions.accept')}
            </Button>
          )}
          {canReject && (
            <Button type="button" variant="outline" onClick={() => setAction('reject')}>
              {t('actions.reject')}
            </Button>
          )}
          {canRegisterPayment && (
            <Button variant="outline" onClick={() => setPaymentOpen(true)}>
              {tBookings('paymentDialog.title')}
            </Button>
          )}
          {canCancel && (
            <Button
              variant="ghost"
              onClick={() => setAction('cancel')}
              disabled={cancelBooking.isPending}
              className="text-destructive hover:text-destructive"
            >
              {t('actions.cancel')}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <dl className="rounded-xl border border-border bg-card p-5 text-sm">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('dates')}</dt>
          <dd className="mt-1 text-foreground">
            {booking.start_date && booking.end_date ? (
              <>
                {formatDate(booking.start_date, locale)} → {formatDate(booking.end_date, locale)}
              </>
            ) : (
              '—'
            )}
          </dd>

          <dt className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">{t('createdAt')}</dt>
          <dd className="mt-1 text-foreground">{formatDateTime(booking.created_at ?? booking.booking_date, locale) || '—'}</dd>

          {booking.expiration_date && (
            <>
              <dt className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">
                {t('expiresAt')}
              </dt>
              <dd className="mt-1 text-foreground">
                {formatDateTime(booking.expiration_date, locale)}
              </dd>
            </>
          )}
        </dl>

        <dl className="rounded-xl border border-border bg-card p-5 text-sm">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('total')}</dt>
          <dd className="mt-1 text-lg font-semibold text-foreground">
            {typeof booking.total_amount === 'number'
              ? formatCurrency(booking.total_amount, locale)
              : '—'}
          </dd>

          <dt className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">{t('deposit')}</dt>
          <dd className="mt-1 text-foreground">
            {typeof booking.deposit_amount === 'number'
              ? formatCurrency(booking.deposit_amount, locale)
              : '—'}
            {booking.deposit_paid && (
              <Badge variant="default" className="ml-2">
                {tBookings('paymentStatus.paid')}
              </Badge>
            )}
          </dd>
        </dl>
      </div>

      {booking.notes && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">{t('message')}</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{booking.notes}</p>
        </div>
      )}

      {!isDashboardAgent && canBookingLeaveReview(booking) && booking.property?.slug && (
        <LeaveReviewCta
          slug={booking.property.slug}
          context={t('reviewContext')}
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

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t('payments')}</h2>
        {booking.booking_payments && booking.booking_payments.length > 0 ? (
          <ul className="mt-3 divide-y divide-border text-sm">
            {booking.booking_payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-muted-foreground">
                  {formatDateTime(p.payment_date ?? p.created_at, locale)} ·{' '}
                  {PAYMENT_TYPE_LABEL_KEY[p.payment_type]
                    ? tBookings(PAYMENT_TYPE_LABEL_KEY[p.payment_type])
                    : p.payment_type}
                  {p.payment_method ? (
                    <>
                      {' · '}
                      {PAYMENT_METHOD_LABEL_KEY[p.payment_method]
                        ? tBookings(PAYMENT_METHOD_LABEL_KEY[p.payment_method])
                        : p.payment_method}
                    </>
                  ) : null}
                  {p.transaction_id ? <> · {tBookings('reference')} {p.transaction_id}</> : null}
                </span>
                <span className="flex items-center gap-2 text-foreground">
                  <span className="font-medium">
                    {formatCurrency(p.amount, locale)}
                  </span>
                  <Badge variant={p.status === 'paid' ? 'default' : 'outline'}>
                    {PAYMENT_STATUS_LABEL_KEY[p.status]
                      ? tBookings(PAYMENT_STATUS_LABEL_KEY[p.status])
                      : p.status}
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
                      className="text-xs text-primary hover:underline"
                    >
                      {t('receipt')}
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{t('noPayments')}</p>
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
              title: t('toasts.accepted.title'),
              description: t('toasts.accepted.description'),
              type: 'success',
            });
          }
          if (action === 'reject') {
            await rejectBooking.mutateAsync({ reason });
            toast.add({
              title: t('toasts.rejected.title'),
              description: t('toasts.rejected.description'),
              type: 'success',
            });
          }
          if (action === 'cancel') {
            await cancelBooking.mutateAsync({ reason });
            toast.add({
              title: t('toasts.cancelled.title'),
              description: t('toasts.cancelled.description'),
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
  const t = useTranslations('bookings.detail');
  const tCommon = useTranslations('common');
  const [reason, setReason] = useState('');
  const open = action !== null;
  const isReasonRequired = action === 'reject' || action === 'cancel';
  const copyKey = action ? ACTION_COPY_KEY[action] : null;

  async function handleSubmit() {
    if (isReasonRequired && reason.trim().length === 0) return;
    await onSubmit(reason.trim() || undefined);
    setReason('');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{copyKey ? t(`${copyKey}.title`) : null}</DialogTitle>
          <DialogDescription>{copyKey ? t(`${copyKey}.description`) : null}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor="booking-action-reason" className="text-xs font-medium text-muted-foreground">
            {copyKey ? t(`${copyKey}.label`) : null}
          </label>
          <Textarea
            id="booking-action-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            placeholder={copyKey ? t(`${copyKey}.placeholder`) : undefined}
            required={isReasonRequired}
          />
          {isReasonRequired && reason.trim().length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('decision.reasonRequired')}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {tCommon('actions.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={pending || (isReasonRequired && reason.trim().length === 0)}
          >
            {pending ? t('decision.processing') : copyKey ? t(`${copyKey}.submit`) : null}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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
  const label = isDepositStep ? t('payCta.deposit') : t('payCta.balance');

  async function handleClick() {
    await createPayment.mutateAsync({
      amount,
      payment_type: paymentType,
      status: 'pending',
    });
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{label}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('payCta.notice')}</p>
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
  const t = useTranslations('bookings.detail');
  const events: TimelineEvent[] = [];
  if (booking.created_at) events.push({ label: t('timeline.created'), at: booking.created_at });
  const confirmedAt = booking.confirmed_at ?? booking.confirmation_date;
  if (confirmedAt) events.push({ label: t('timeline.confirmed'), at: confirmedAt });
  if (booking.deposit_paid && booking.deposit_date) {
    events.push({ label: t('timeline.depositPaid'), at: booking.deposit_date });
  }
  if (booking.completion_date) events.push({ label: t('timeline.settled'), at: booking.completion_date });
  const cancelledAt = booking.cancelled_at ?? booking.cancellation_date;
  if (cancelledAt) events.push({ label: t('timeline.cancelled'), at: cancelledAt });
  if (booking.rejection_date) events.push({ label: t('timeline.rejected'), at: booking.rejection_date });
  const expiredAt = booking.expired_at ?? booking.expires_at ?? booking.expiration_date;
  if (expiredAt && booking.status === 'expired') {
    events.push({ label: t('timeline.expired'), at: expiredAt });
  }

  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  if (events.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">{t('timeline.title')}</h2>
      <ol className="mt-3 space-y-2 text-sm">
        {events.map((e) => (
          <li key={`${e.label}-${e.at}`} className="flex items-baseline gap-3">
            <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground" aria-hidden="true" />
            <span className="text-foreground font-medium">{e.label}</span>
            <span className="text-xs text-muted-foreground">
              {formatDateTime(e.at, locale)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
