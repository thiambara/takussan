'use client';
import { useMemo, useState } from 'react';
import { LienLocalise } from '@/components/shared/LienLocalise';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { useBookingRequest } from '@/hooks/useBookingRequest';
import { submitPurchaseOffer } from '@/app/actions/property';
import { formatCurrency } from '@/lib/format/currency';
import { getPrimaryCtaForProperty } from '@/lib/property-cta';
import { quoteBooking } from '@/lib/booking-quote';
import { ROUTES_LEGALES } from '@/lib/legal-routes';
import { useTranslations } from 'next-intl';

import type { PropertyDetail } from '@/types/property';


interface PropertyReservationDialogProps {
  property: PropertyDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function formatPrice(price: number, currency: string | null): string {
  return formatCurrency(price, currency ?? 'XOF');
}

export function PropertyReservationDialog({
  property,
  open,
  onOpenChange,
  onSuccess,
}: PropertyReservationDialogProps) {
  const t = useTranslations('property.reservation');
  const { user } = useAuth();
  const action = getPrimaryCtaForProperty(property).action;
  const isOfferFlow = action === 'offer';

  if (!user) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t(`${action}.loginTitle`)}</DialogTitle>
            <DialogDescription>{t(`${action}.loginBody`)}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <LienLocalise
              href={`/auth/login?redirect=/properties/${property.slug}`}
              className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-3 h-8 text-sm font-medium hover:bg-primary/80 transition-colors"
            >
              {t('signIn')}
            </LienLocalise>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {isOfferFlow ? (
          <OfferForm
            property={property}
            onClose={() => onOpenChange(false)}
            onSuccess={onSuccess}
            submitLabel={t(`${action}.submit`)}
            title={t(`${action}.dialogTitle`)}
          />
        ) : (
          <ReservationForm
            property={property}
            onClose={() => onOpenChange(false)}
            onSuccess={onSuccess}
            submitLabel={t(`${action}.submit`)}
            title={t(`${action}.dialogTitle`)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Reservation form (rent) — preserves the previous behaviour ─────────────
interface InnerFormProps {
  property: PropertyDetail;
  onClose: () => void;
  onSuccess?: () => void;
  submitLabel: string;
  title: string;
}

function ReservationForm({ property, onClose, onSuccess, submitLabel, title }: InnerFormProps) {
  const t = useTranslations('property.reservation');
  const { submit, submitting, error } = useBookingRequest(property.slug);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [guests, setGuests] = useState(1);
  const [message, setMessage] = useState('');

  const nights = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const s = new Date(startDate);
    const e = new Date(endDate);
    const diff = Math.round((e.getTime() - s.getTime()) / 86_400_000);
    return Math.max(0, diff);
  }, [startDate, endDate]);

  // TCK-535 — même règle que le tunnel (TCK-530) et que l'API : `daily` × nuits, `weekly` ÷ 7.
  // Cette boîte multipliait le loyer par les nuits quelle que soit sa période.
  const quote = quoteBooking(property, nights);
  // Un loyer au mois ou à l'année n'est pas un séjour : c'est la candidature de « Postuler »
  // (TCK-165), enregistrée au montant d'UN loyer par l'API. La période s'affiche, jamais des nuits.
  const tPeriods = useTranslations('property.rentPeriodsShort');
  const longTermPeriod = property.rent_period === 'yearly' ? 'yearly' : 'monthly';

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await submit({
        start_date: startDate,
        end_date: endDate,
        guests,
        message: message || undefined,
      });
      onClose();
      onSuccess?.();
    } catch {
      // already tracked
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{t('booking.description')}</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm">
            <span className="text-foreground">{t('booking.checkIn')}</span>
            <DatePicker
              required
              value={startDate}
              onValueChange={setStartDate}
              min={new Date().toISOString().slice(0, 10)}
              placeholder={t('booking.checkInPlaceholder')}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-foreground">{t('booking.checkOut')}</span>
            <DatePicker
              required
              value={endDate}
              onValueChange={setEndDate}
              min={startDate || new Date().toISOString().slice(0, 10)}
              placeholder={t('booking.checkOutPlaceholder')}
            />
          </label>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="text-foreground">{t('booking.guests')}</span>
          <Input
            type="number"
            required
            min={1}
            max={20}
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value) || 1)}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-foreground">{t('booking.message')}</span>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('booking.messagePlaceholder')}
            rows={3}
          />
        </label>
        {quote.kind === 'stay' && quote.nights > 0 && (
          <div className="rounded-md bg-muted/60 p-3 text-sm space-y-1" data-testid="reservation-quote">
            <div className="flex justify-between gap-3">
              <span className="min-w-0 text-muted-foreground">
                {t(quote.period === 'weekly' ? 'booking.weeklyLine' : 'booking.nightsLine', {
                  price: formatPrice(property.price, property.currency),
                  count: quote.nights,
                })}
              </span>
              <span className="shrink-0 whitespace-nowrap text-foreground">
                {formatPrice(quote.total, property.currency)}
              </span>
            </div>
            <div className="flex justify-between gap-3 font-semibold pt-1 border-t border-border">
              <span>{t('booking.estimatedTotal')}</span>
              <span className="shrink-0 whitespace-nowrap">{formatPrice(quote.total, property.currency)}</span>
            </div>
            <div className="flex justify-between gap-3 text-xs text-muted-foreground">
              <span>{t('booking.deposit')}</span>
              <span className="shrink-0 whitespace-nowrap">{formatPrice(quote.deposit, property.currency)}</span>
            </div>
          </div>
        )}
        {quote.kind === 'long_term' && (
          <div className="rounded-md bg-muted/60 p-3 text-sm space-y-1" data-testid="reservation-rent">
            <div className="flex justify-between gap-3 font-semibold">
              <span>{t('booking.rentLine')}</span>
              <span className="shrink-0 whitespace-nowrap">
                {formatPrice(property.price, property.currency)} / {tPeriods(longTermPeriod)}
              </span>
            </div>
            <p className="text-pretty text-xs text-muted-foreground">{t('booking.rentNotice')}</p>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? t('sending') : submitLabel}
          </Button>
        </div>
      </form>
    </>
  );
}

// ─── Offer form (sale) — TCK-176 ────────────────────────────────────────────
function OfferForm({ property, onClose, onSuccess, submitLabel, title }: InnerFormProps) {
  const t = useTranslations('property.reservation');
  const [offerAmount, setOfferAmount] = useState('');
  const [offerExpiresAt, setOfferExpiresAt] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minExpiry = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  }, []);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const amount = Number(offerAmount.replace(/\s+/g, ''));
      if (!Number.isFinite(amount) || amount <= 0) {
        setError(t('offerForm.invalidAmount'));
        return;
      }
      const res = await submitPurchaseOffer(property.slug, {
        offer_amount: amount,
        offer_expires_at: offerExpiresAt,
        terms_accepted: true,
        message: message || undefined,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      onClose();
      onSuccess?.();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {t('offerForm.description', {
            price: formatPrice(property.price, property.currency),
          })}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block space-y-1 text-sm">
          <span className="text-foreground">
            {t('offerForm.amount', { currency: property.currency ?? 'XOF' })}
          </span>
          <Input
            type="number"
            required
            min={1}
            inputMode="numeric"
            value={offerAmount}
            onChange={(e) => setOfferAmount(e.target.value)}
            placeholder={String(property.price)}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-foreground">{t('offerForm.validity')}</span>
          <DatePicker
            required
            value={offerExpiresAt}
            onValueChange={setOfferExpiresAt}
            min={minExpiry}
            placeholder={t('offerForm.expiryPlaceholder')}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-foreground">{t('offerForm.message')}</span>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('offerForm.messagePlaceholder')}
            rows={3}
          />
        </label>
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            required
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            className="mt-1"
          />
          <span>
            {t('offerForm.termsBefore')}{' '}
            <LienLocalise
              href={ROUTES_LEGALES.terms}
              target="_blank"
              rel="noopener"
              className="text-primary underline"
            >
              {t('offerForm.termsLink')}
            </LienLocalise>
            {' '}{t('offerForm.termsAfter')}
          </span>
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={submitting || !termsAccepted}>
            {submitting ? t('sending') : submitLabel}
          </Button>
        </div>
      </form>
    </>
  );
}
