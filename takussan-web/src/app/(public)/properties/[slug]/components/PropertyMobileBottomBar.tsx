'use client';
import { KeyRound, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/format/currency';
import { getPrimaryCtaForProperty } from '@/lib/property-cta';
import type { PropertyDetail } from '@/types/property';

const SHORT_LABEL: Record<'offer' | 'reserve' | 'apply', string> = {
  offer: 'Offre',
  reserve: 'Réserver',
  apply: 'Postuler',
};

interface PropertyMobileBottomBarProps {
  property: PropertyDetail;
  onRequestVisit: () => void;
  onRequestBooking: () => void;
}

// TCK-078 — shared formatter.
function formatPrice(price: number, currency: string | null): string {
  return formatCurrency(price, currency ?? 'XOF');
}

export function PropertyMobileBottomBar({
  property,
  onRequestVisit,
  onRequestBooking,
}: PropertyMobileBottomBarProps) {
  const isRent = property.contract_type === 'rent';
  const periodLabel = property.rent_period_label ?? (isRent ? 'mois' : null);
  const primaryCta = getPrimaryCtaForProperty(property);

  return (
    <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-stone-200 bg-white/95 backdrop-blur px-4 py-3 flex items-center gap-3 safe-area-bottom">
      <div className="min-w-0">
        <p className="text-lg font-bold text-stone-900 truncate">
          {formatPrice(property.price, property.currency)}
          {periodLabel && <span className="text-xs font-normal text-stone-500">/{periodLabel}</span>}
        </p>
      </div>
      <div className="ml-auto flex gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onRequestVisit}>
          <Calendar className="size-4" aria-hidden />
          Visiter
        </Button>
        <Button type="button" size="sm" className="gap-1.5" onClick={onRequestBooking}>
          <KeyRound className="size-4" aria-hidden />
          {SHORT_LABEL[primaryCta.action]}
        </Button>
      </div>
    </div>
  );
}
