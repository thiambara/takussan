'use client';

import { useTranslations } from 'next-intl';
import {
  Brush,
  Drill,
  Hammer,
  KeyRound,
  Snowflake,
  Wrench,
  Zap,
} from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * TCK-261 — checkbox-style multi-select for SP métiers.
 *
 * No external lib (the project ships no headless multi-select today). Each
 * trade is rendered as a tap-friendly chip with an icon — keeps the wizard
 * accessible on mobile without sacrificing affordance.
 */
export const TRADE_OPTIONS = [
  'plumbing',
  'electrical',
  'climate_control',
  'locksmith',
  'painting',
  'masonry',
  'other',
] as const;

export type TradeOption = (typeof TRADE_OPTIONS)[number];

export type TradesMultiSelectProps = {
  value: string[];
  onChange: (next: string[]) => void;
  className?: string;
};

const TRADE_ICONS: Record<TradeOption, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  plumbing: Wrench,
  electrical: Zap,
  climate_control: Snowflake,
  locksmith: KeyRound,
  painting: Brush,
  masonry: Hammer,
  other: Drill,
};

export function TradesMultiSelect({ value, onChange, className }: TradesMultiSelectProps) {
  const t = useTranslations('serviceProviders.onboarding.trades');

  const toggle = (trade: TradeOption) => {
    onChange(
      value.includes(trade) ? value.filter((v) => v !== trade) : [...value, trade],
    );
  };

  return (
    <fieldset className={cn('flex flex-col gap-2', className)}>
      <legend className="sr-only">{t('legend')}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {TRADE_OPTIONS.map((trade) => {
          const Icon = TRADE_ICONS[trade];
          const checked = value.includes(trade);
          return (
            <label
              key={trade}
              data-testid={`trade-${trade}`}
              data-checked={checked || undefined}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-xl border bg-background p-3 text-sm transition',
                checked
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-border text-muted-foreground hover:border-primary/40',
              )}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                onChange={() => toggle(trade)}
              />
              <Icon className="size-4" aria-hidden />
              <span className="font-medium">{t(`options.${trade}`)}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
