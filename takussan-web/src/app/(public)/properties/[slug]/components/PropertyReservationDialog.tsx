'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
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
import type { PropertyDetail } from '@/types/property';

const COPY: Record<
  'offer' | 'reserve' | 'apply',
  { dialogTitle: string; loginTitle: string; loginBody: string; submit: string }
> = {
  offer: {
    dialogTitle: 'Faire une offre',
    loginTitle: 'Connectez-vous pour faire une offre',
    loginBody: 'Vous devez être connecté pour soumettre une offre.',
    submit: 'Envoyer l’offre',
  },
  reserve: {
    dialogTitle: 'Réserver ce bien',
    loginTitle: 'Connectez-vous pour réserver',
    loginBody: 'Vous devez être connecté pour faire une demande de réservation.',
    submit: 'Envoyer la demande',
  },
  apply: {
    dialogTitle: 'Postuler à ce bien',
    loginTitle: 'Connectez-vous pour postuler',
    loginBody: 'Vous devez être connecté pour soumettre votre dossier de location.',
    submit: 'Envoyer ma candidature',
  },
};

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
  const { user } = useAuth();
  const action = getPrimaryCtaForProperty(property).action;
  const isOfferFlow = action === 'offer';
  const copy = COPY[action];

  if (!user) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.loginTitle}</DialogTitle>
            <DialogDescription>{copy.loginBody}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Link
              href={`/auth/login?redirect=/properties/${property.slug}`}
              className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-3 h-8 text-sm font-medium hover:bg-primary/80 transition-colors"
            >
              Se connecter
            </Link>
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
            submitLabel={copy.submit}
            title={copy.dialogTitle}
          />
        ) : (
          <ReservationForm
            property={property}
            onClose={() => onOpenChange(false)}
            onSuccess={onSuccess}
            submitLabel={copy.submit}
            title={copy.dialogTitle}
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
        <DialogDescription>
          Précisez vos dates et le nombre d&apos;invités. Le propriétaire confirmera votre demande.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm">
            <span className="text-stone-700">Arrivée</span>
            <DatePicker
              required
              value={startDate}
              onValueChange={setStartDate}
              min={new Date().toISOString().slice(0, 10)}
              placeholder="Date d'arrivée"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-stone-700">Départ</span>
            <DatePicker
              required
              value={endDate}
              onValueChange={setEndDate}
              min={startDate || new Date().toISOString().slice(0, 10)}
              placeholder="Date de départ"
            />
          </label>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="text-stone-700">Invités</span>
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
          <span className="text-stone-700">Message (optionnel)</span>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Présentez-vous, expliquez votre projet…"
            rows={3}
          />
        </label>
        {nights > 0 && (
          <div className="rounded-md bg-stone-50 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-stone-600">
                {formatPrice(property.price, property.currency)} × {nights} nuit{nights > 1 ? 's' : ''}
              </span>
              <span className="text-stone-900">{formatPrice(total, property.currency)}</span>
            </div>
            <div className="flex justify-between font-semibold pt-1 border-t border-stone-200">
              <span>Total estimé</span>
              <span>{formatPrice(total, property.currency)}</span>
            </div>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Envoi…' : submitLabel}
          </Button>
        </div>
      </form>
    </>
  );
}

// ─── Offer form (sale) — TCK-176 ────────────────────────────────────────────
function OfferForm({ property, onClose, onSuccess, submitLabel, title }: InnerFormProps) {
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
        setError('Montant invalide.');
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
          Prix d&apos;affichage : {formatPrice(property.price, property.currency)}. Le propriétaire
          examinera votre offre avant son expiration.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block space-y-1 text-sm">
          <span className="text-stone-700">Montant proposé ({property.currency ?? 'XOF'})</span>
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
          <span className="text-stone-700">Validité de l&apos;offre</span>
          <DatePicker
            required
            value={offerExpiresAt}
            onValueChange={setOfferExpiresAt}
            min={minExpiry}
            placeholder="Date d'expiration"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-stone-700">Message (optionnel)</span>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Précisez les conditions ou le contexte de votre offre…"
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
            J&apos;ai lu et j&apos;accepte les{' '}
            <Link href="/legal/cgu" className="text-app-accent underline">
              conditions générales
            </Link>
            {' '}d&apos;utilisation pour la soumission d&apos;une offre d&apos;achat.
          </span>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" disabled={submitting || !termsAccepted}>
            {submitting ? 'Envoi…' : submitLabel}
          </Button>
        </div>
      </form>
    </>
  );
}
