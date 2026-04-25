'use client';

import { useAgencyCurrency } from '@/hooks/useAgencyCurrency';
import {
  formatCurrency,
  type CurrencyCode,
  type FormatCurrencyOptions,
} from '@/lib/format/currency';

/**
 * TCK-084 — drop-in monetary value renderer.
 *
 * Two flavours:
 *   1. `<Money value={loyer} currency="EUR" />` — explicit currency, no
 *      network call. Use this when the caller already knows which currency
 *      governs the amount (e.g. an invoice row whose `currency` is locked at
 *      issuance time).
 *   2. `<Money value={loyer} agencyId={agency.id} />` — derives the currency
 *      from the agency's settings via {@link useAgencyCurrency}. Use this on
 *      surfaces where the source of truth is the agency itself (property
 *      cards, dashboards, settings preview).
 *
 * `currency` always wins over `agencyId` when both are provided so the
 * locked-currency invariant carried by invoices/leases (see ticket "Hors
 * périmètre") is honoured.
 */

interface MoneyPropsBase {
  readonly value: number | null | undefined;
  readonly className?: string;
  readonly options?: FormatCurrencyOptions;
  /**
   * Display the ISO 4217 code as a small sibling label — useful on public
   * lists where multiple agencies (and thus currencies) share a page.
   */
  readonly showCurrencyCode?: boolean;
}

interface MoneyPropsExplicit extends MoneyPropsBase {
  readonly currency: CurrencyCode | string;
  readonly agencyId?: never;
}

interface MoneyPropsAgency extends MoneyPropsBase {
  readonly currency?: never;
  readonly agencyId: number;
}

interface MoneyPropsFallback extends MoneyPropsBase {
  readonly currency?: undefined;
  readonly agencyId?: undefined;
}

export type MoneyProps = MoneyPropsExplicit | MoneyPropsAgency | MoneyPropsFallback;

export function Money(props: MoneyProps) {
  const { value, className, options, showCurrencyCode } = props;

  // Explicit currency path — short-circuit so we do not even mount the hook.
  if ('currency' in props && props.currency) {
    const formatted = formatCurrency(value, props.currency, options);
    return (
      <span className={className}>
        {formatted}
        {showCurrencyCode && formatted ? (
          <span className="ml-1 text-xs text-muted-foreground">{props.currency}</span>
        ) : null}
      </span>
    );
  }

  // Agency-derived path — call the hook unconditionally; it tolerates a
  // missing id by short-circuiting internally.
  return (
    <MoneyFromAgency
      value={value}
      agencyId={('agencyId' in props ? props.agencyId : undefined) ?? null}
      className={className}
      options={options}
      showCurrencyCode={showCurrencyCode}
    />
  );
}

interface MoneyFromAgencyProps {
  readonly value: number | null | undefined;
  readonly agencyId: number | null;
  readonly className?: string;
  readonly options?: FormatCurrencyOptions;
  readonly showCurrencyCode?: boolean;
}

function MoneyFromAgency({
  value,
  agencyId,
  className,
  options,
  showCurrencyCode,
}: MoneyFromAgencyProps) {
  const { currency, formatter } = useAgencyCurrency(agencyId);
  const formatted = formatter(value, options);

  return (
    <span className={className}>
      {formatted}
      {showCurrencyCode && formatted ? (
        <span className="ml-1 text-xs text-muted-foreground">{currency}</span>
      ) : null}
    </span>
  );
}
