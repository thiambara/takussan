'use client';
import { useTranslations } from 'next-intl';
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
  /**
   * TCK-500 — `false` retire le bouton. Un agent (ou le propriétaire) n'a personne à qui écrire
   * sur son propre bien : l'API répondait 422 APRÈS qu'il ait rédigé son message.
   */
  canMessage?: boolean;
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
  canMessage = true,
}: PropertyBookingCardProps) {
  const t = useTranslations('property.detail');
  const tPeriods = useTranslations('property.rentPeriodsShort');
  const isRent = property.contract_type === 'rent';
  const periodLabel = isRent ? tPeriods(property.rent_period ?? 'monthly') : null;
  const primaryCta = getPrimaryCtaForProperty(property);

  return (
    <aside className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-foreground tabular-nums">
            {formatPrice(property.price, property.currency)}
          </span>
          {periodLabel && <span className="text-sm text-muted-foreground">/{periodLabel}</span>}
        </div>
        {property.contract_type_label && (
          <p className="text-sm text-muted-foreground mt-0.5">{property.contract_type_label}</p>
        )}
      </div>

      <div className="space-y-2">
        <Button type="button" className="w-full h-11 gap-2" onClick={onRequestBooking}>
          <KeyRound className="size-4" aria-hidden />
          {t(`primaryCta.${primaryCta.action}`)}
        </Button>
        <Button type="button" variant="outline" className="w-full h-11 gap-2" onClick={onRequestVisit}>
          <Calendar className="size-4" aria-hidden />
          {t('requestVisit')}
        </Button>
        {canMessage && (
          <Button type="button" variant="ghost" className="w-full h-11 gap-2" onClick={onMessage}>
            <MessageCircle className="size-4" aria-hidden />
            {t('sendMessage')}
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center text-pretty">
        {t('noChargeNotice')}
      </p>
    </aside>
  );
}
