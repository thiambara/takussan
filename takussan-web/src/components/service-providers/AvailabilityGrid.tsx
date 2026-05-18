'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

import type { AvailabilitySlot } from '@/lib/service-provider-onboarding';
import { cn } from '@/lib/utils';

/**
 * TCK-261 — 7-day × 3-period availability grid.
 *
 * Backend contract is `[{day, from, to}, ...]` so the grid serializes its
 * own internal `{ monday: ['morning', ...], ... }` map back into that
 * shape at submit time via {@link slotsFromState}.
 */

export const DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type DayKey = (typeof DAYS)[number];

export const PERIODS = ['morning', 'afternoon', 'evening'] as const;

export type PeriodKey = (typeof PERIODS)[number];

export type AvailabilityState = Record<DayKey, PeriodKey[]>;

const PERIOD_TIMES: Record<PeriodKey, { from: string; to: string }> = {
  morning: { from: '08:00', to: '12:00' },
  afternoon: { from: '12:00', to: '17:00' },
  evening: { from: '17:00', to: '21:00' },
};

export function emptyAvailabilityState(): AvailabilityState {
  return DAYS.reduce<AvailabilityState>(
    (acc, day) => ({ ...acc, [day]: [] }),
    {} as AvailabilityState,
  );
}

/** Serialize the internal `{day → period[]}` state into the API shape. */
export function slotsFromState(state: AvailabilityState): AvailabilitySlot[] {
  const slots: AvailabilitySlot[] = [];
  for (const day of DAYS) {
    for (const period of state[day] ?? []) {
      slots.push({ day, ...PERIOD_TIMES[period] });
    }
  }
  return slots;
}

/**
 * Best-effort de-serialize from the API shape back into the grid state.
 * Periods are matched by exact `from/to` tuples — slots that don't match
 * a known period are dropped silently (they remain on the SP profile in
 * `metadata.availability` and can be edited via a future "advanced" UI).
 */
export function stateFromSlots(slots: AvailabilitySlot[] | undefined | null): AvailabilityState {
  const out = emptyAvailabilityState();
  if (!Array.isArray(slots)) return out;
  for (const slot of slots) {
    const period = (Object.keys(PERIOD_TIMES) as PeriodKey[]).find(
      (p) => PERIOD_TIMES[p].from === slot.from && PERIOD_TIMES[p].to === slot.to,
    );
    if (period && DAYS.includes(slot.day as DayKey)) {
      const day = slot.day as DayKey;
      if (!out[day].includes(period)) out[day].push(period);
    }
  }
  return out;
}

export type AvailabilityGridProps = {
  value: AvailabilityState;
  onChange: (next: AvailabilityState) => void;
};

export function AvailabilityGrid({ value, onChange }: AvailabilityGridProps) {
  const t = useTranslations('serviceProviders.onboarding.availability');

  const cells = useMemo(() => DAYS.map((day) => ({ day })), []);

  const toggle = (day: DayKey, period: PeriodKey) => {
    const current = value[day] ?? [];
    const next = current.includes(period)
      ? current.filter((p) => p !== period)
      : [...current, period];
    onChange({ ...value, [day]: next });
  };

  return (
    <table
      className="w-full border-separate border-spacing-y-1 text-sm"
      aria-label={t('ariaLabel')}
    >
      <thead>
        <tr className="text-xs uppercase tracking-wide text-muted-foreground">
          <th className="text-left font-medium">{t('dayHeader')}</th>
          {PERIODS.map((period) => (
            <th key={period} className="px-2 text-center font-medium">
              <span className="block">{t(`periods.${period}.label`)}</span>
              <span className="block text-[11px] font-normal text-muted-foreground/80">
                {PERIOD_TIMES[period].from}–{PERIOD_TIMES[period].to}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {cells.map(({ day }) => (
          <tr key={day}>
            <th
              scope="row"
              className="text-left font-medium text-foreground"
            >
              {t(`days.${day}`)}
            </th>
            {PERIODS.map((period) => {
              const checked = value[day]?.includes(period) ?? false;
              return (
                <td key={period} className="px-1 align-middle">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={checked}
                    aria-label={t('cellAria', {
                      day: t(`days.${day}`),
                      period: t(`periods.${period}.label`),
                    })}
                    data-testid={`availability-${day}-${period}`}
                    onClick={() => toggle(day, period)}
                    className={cn(
                      'h-9 w-full rounded-md border text-xs font-medium transition',
                      checked
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:border-primary/40',
                    )}
                  >
                    {checked ? t('on') : t('off')}
                  </button>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
