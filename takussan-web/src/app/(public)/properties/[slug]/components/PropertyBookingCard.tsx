'use client';
import { Calendar, KeyRound, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/format/currency';
import { getPrimaryCtaForProperty } from '@/lib/property-cta';
import type { PropertyDetail } from '@/types/property';

interface PropertyBookingCardProps {
  property: PropertyDetail;
  onRequestVisit: () => void;
  onRequestBooking: () => void;
  onMessage: () => void;
}

// TCK-078 — thin wrapper over the shared formatCurrency helper so the
// component keeps its existing call signature.
function formatPrice(price: number, currency: string | null): string {
  return formatCurrency(price, currency ?? 'XOF');
}

export function PropertyBookingCard({
  property,
  onRequestVisit,
  onRequestBooking,
  onMessage,
}: PropertyBookingCardProps) {
  const isRent = property.contract_type === 'rent';
  const periodLabel = property.rent_period_label ?? (isRent ? 'mois' : null);
  const primaryCta = getPrimaryCtaForProperty(property);

  return (
    <aside className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm space-y-4 lg:sticky lg:top-40">
      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-stone-900">
            {formatPrice(property.price, property.currency)}
          </span>
          {periodLabel && <span className="text-sm text-stone-500">/ {periodLabel}</span>}
        </div>
        {property.contract_type_label && (
          <p className="text-sm text-stone-500 mt-0.5">{property.contract_type_label}</p>
        )}
      </div>

      <div className="space-y-2">
        <Button type="button" className="w-full gap-2" onClick={onRequestBooking}>
          <KeyRound className="size-4" aria-hidden />
          {primaryCta.label}
        </Button>
        <Button type="button" variant="outline" className="w-full gap-2" onClick={onRequestVisit}>
          <Calendar className="size-4" aria-hidden />
          Demander une visite
        </Button>
        <Button type="button" variant="ghost" className="w-full gap-2" onClick={onMessage}>
          <MessageCircle className="size-4" aria-hidden />
          Envoyer un message
        </Button>
      </div>

      <p className="text-xs text-stone-500 text-center">
        Vous ne serez pas débité avant la confirmation.
      </p>
    </aside>
  );
}
