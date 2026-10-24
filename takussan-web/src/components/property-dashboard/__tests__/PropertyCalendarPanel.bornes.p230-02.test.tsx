/**
 * P230.02 (TCK-2230) — « Bloquer des dates » ne propose que ce que `StorePropertyUnavailabilityRequest`
 * accepte : `ends_on` `after:starts_on` (le jour de reprise est au plus tôt le lendemain de la
 * première nuit) et `before_or_equal:` le jour de l'API + 24 mois (la première nuit est donc au plus
 * tard la veille de cette borne).
 *
 * Le `DatePicker` est simulé en `<input>` qui porte ses `min`/`max` : la primitive grise ce qui est
 * avant `min` ou après `max` (`date-picker.tsx`), c'est ce qu'on lui passe qu'on éprouve ici.
 */
process.env.TZ = 'America/New_York';

import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { PropertyCalendarPanel } from '../PropertyCalendarPanel';

const mutation = { mutateAsync: vi.fn(), isPending: false };

vi.mock('@/lib/queries/property-calendar', () => ({
  usePropertyConfirmedStays: () => ({ isLoading: false, data: { data: [] } }),
  usePropertyUnavailabilities: () => ({ isLoading: false, data: { data: [] } }),
  useCalendarFeeds: () => ({ isLoading: false, data: { data: [] } }),
  useCreateUnavailability: () => mutation,
  useDeleteUnavailability: () => mutation,
  useCreateCalendarFeed: () => mutation,
  useSyncCalendarFeed: () => mutation,
  useDeleteCalendarFeed: () => mutation,
  useGenerateIcalLink: () => mutation,
}));
vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({
    value,
    onValueChange,
    placeholder,
    min,
    max,
  }: {
    value?: string;
    onValueChange: (v: string) => void;
    placeholder?: string;
    min?: string;
    max?: string;
  }) => (
    <input aria-label={placeholder} value={value ?? ''} min={min} max={max} onChange={(e) => onValueChange(e.target.value)} />
  ),
}));

describe('PropertyCalendarPanel — bornes du blocage (P230.02)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 01:00 Z le 25 octobre : encore le 24 à New York, déjà le 25 pour l'API.
    vi.setSystemTime(new Date('2026-10-25T01:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('le jour de reprise commence au lendemain de la première nuit', () => {
    render(withIntl(<PropertyCalendarPanel propertyId={7} />));
    const form = screen.getByTestId('calendar-block-form');

    fireEvent.change(within(form).getByLabelText('Première nuit'), { target: { value: '2026-10-27' } });

    expect(within(form).getByLabelText('Jour de reprise')).toHaveAttribute('min', '2026-10-28');
  });

  it('les deux champs s’arrêtent à la borne de l’API, le jour de l’API + 24 mois', () => {
    render(withIntl(<PropertyCalendarPanel propertyId={7} />));
    const form = screen.getByTestId('calendar-block-form');

    expect(within(form).getByLabelText('Jour de reprise')).toHaveAttribute('max', '2028-10-25');
    expect(within(form).getByLabelText('Première nuit')).toHaveAttribute('max', '2028-10-24');
  });
});
