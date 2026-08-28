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

  const isRent = property.contract_type === 'rent';
  const total = isRent && nights > 0 ? property.price * nights : property.price;

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
            <span className="text-stone-700">{t('booking.checkIn')}</span>
            <DatePicker
              required
              value={startDate}
              onValueChange={setStartDate}
              min={new Date().toISOString().slice(0, 10)}
              placeholder={t('booking.checkInPlaceholder')}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-stone-700">{t('booking.checkOut')}</span>
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
          <span className="text-stone-700">{t('booking.guests')}</span>
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
          <span className="text-stone-700">{t('booking.message')}</span>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('booking.messagePlaceholder')}
            rows={3}
          />
        </label>
        {nights > 0 && (
          <div className="rounded-md bg-stone-50 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-stone-600">
                {t('booking.nightsLine', {
                  price: formatPrice(property.price, property.currency),
                  count: nights,
                })}
              </span>
              <span className="text-stone-900">{formatPrice(total, property.currency)}</span>
            </div>
            <div className="flex justify-between font-semibold pt-1 border-t border-stone-200">
              <span>{t('booking.estimatedTotal')}</span>
              <span>{formatPrice(total, property.currency)}</span>
            </div>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
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
          <span className="text-stone-700">
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
          <span className="text-stone-700">{t('offerForm.validity')}</span>
          <DatePicker
            required
            value={offerExpiresAt}
            onValueChange={setOfferExpiresAt}
            min={minExpiry}
            placeholder={t('offerForm.expiryPlaceholder')}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-stone-700">{t('offerForm.message')}</span>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('offerForm.messagePlaceholder')}
            rows={3}
          />
        </label>
        <label className="flex items-start gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            required
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            className="mt-1"
          />
          <span>
            {t('offerForm.termsBefore')}{' '}
            <LienLocalise href="/legal/cgu" className="text-primary underline">
              {t('offerForm.termsLink')}
            </LienLocalise>
            {' '}{t('offerForm.termsAfter')}
          </span>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
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
