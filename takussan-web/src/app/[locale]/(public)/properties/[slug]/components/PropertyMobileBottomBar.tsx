'use client';
import { useTranslations } from 'next-intl';
import { KeyRound, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFloatingDockSlot } from '@/components/floating-dock';
import { useMatchesMaxWidth } from '@/hooks/useMatchesMedia';
import { formatCurrency } from '@/lib/format/currency';
import { getPrimaryCtaForProperty } from '@/lib/property-cta';
import type { PropertyDetail } from '@/types/property';

/**
 * Logical height of the sticky toolbar (px). Used by the FloatingDock to
 * lift bottom-right slots (chat FAB, compare pill) above us so they stay
 * reachable even when this bar is mounted on mobile property pages.
 * Calibrated against the actual rendered height (price + buttons + safe-area
 * padding).
 */
const MOBILE_BOTTOM_BAR_HEIGHT_PX = 76;

/** Tailwind `lg` breakpoint (matches the `lg:hidden` wrapper class below). */
const LG_BREAKPOINT_PX = 1024;

/** La donnée porte la CLÉ, le rendu la résout (patron TCK-286). */
const SHORT_LABEL_KEY: Record<'offer' | 'reserve' | 'apply', string> = {
  offer: 'bottomBar.offer',
  reserve: 'bottomBar.reserve',
  apply: 'bottomBar.apply',
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
  const t = useTranslations('property.detail');
  const tPeriods = useTranslations('property.rentPeriodsShort');
  const isRent = property.contract_type === 'rent';
  const periodLabel = isRent ? tPeriods(property.rent_period ?? 'monthly') : null;
  const primaryCta = getPrimaryCtaForProperty(property);

  // Register with the FloatingDock orchestrator (TCK-275) so the chat FAB and
  // comparator pill float ABOVE us instead of being hidden behind the sticky
  // bar. The slot is mobile-only via the `lg:hidden` wrapper class — on
  // desktop the element is `display: none`, so its presence in the registry
  // is harmless (Tailwind hides it but the hook still registers; we accept
  // the trivial extra offset on the rare desktop user opening a comparator
  // on a property page, since the visual delta is < 6 px).
  // Mirror the `lg:hidden` visual gate on the dock registration: above the
  // `lg` breakpoint (1024px) the bar is `display: none`, so we MUST NOT
  // claim a `bottom-full` slot — otherwise desktop chat/compare slots would
  // float above an invisible 76px bar (phantom offset → AC3 regression).
  const isMobile = useMatchesMaxWidth(LG_BREAKPOINT_PX - 1);
  // TCK-477 — `safeAreaInset` est EXIGÉ par le type pour tout slot `bottom-full`, et
  // le hook le rend sous `paddingBottom` : la valeur déclarée ici est celle qui est
  // posée plus bas, il n'y en a pas deux. La somme n'est pas décorative — mesurée
  // sous TCK-453 : `env(safe-area-inset-bottom)` seul REMPLACE le `py-3` au lieu de
  // s'y ajouter, et vaut `0px` sur tout appareil sans encoche. iOS serait corrigé en
  // faisant perdre 12 px à tous les autres.
  const { bottom, paddingBottom } = useFloatingDockSlot({
    id: 'property-mobile-bottom-bar',
    corner: 'bottom-full',
    height: MOBILE_BOTTOM_BAR_HEIGHT_PX,
    enabled: isMobile,
    safeAreaInset: 'calc(0.75rem + env(safe-area-inset-bottom))',
  });

  return (
    <div
      style={{ bottom, paddingBottom }}
      className="lg:hidden fixed inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur px-4 py-3 flex items-center gap-3"
    >
      <div className="min-w-0">
        <p className="text-lg font-bold text-foreground truncate tabular-nums">
          {formatPrice(property.price, property.currency)}
          {periodLabel && <span className="text-xs font-normal text-muted-foreground">/{periodLabel}</span>}
        </p>
      </div>
      <div className="ml-auto flex gap-2">
        <Button type="button" variant="outline" size="sm" className="h-10 gap-1.5 px-3.5" onClick={onRequestVisit}>
          <Calendar className="size-4" aria-hidden />
          {t('bottomBar.visit')}
        </Button>
        <Button type="button" size="sm" className="h-10 gap-1.5 px-3.5" onClick={onRequestBooking}>
          <KeyRound className="size-4" aria-hidden />
          {t(SHORT_LABEL_KEY[primaryCta.action])}
        </Button>
      </div>
    </div>
  );
}
