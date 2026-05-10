import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import frMessages from '@/messages/fr.json';
import {
  AvailabilityGrid,
  emptyAvailabilityState,
  slotsFromState,
  stateFromSlots,
} from '../AvailabilityGrid';

function withIntl(node: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {node}
    </NextIntlClientProvider>
  );
}

describe('AvailabilityGrid', () => {
  it('toggles a slot on then off and propagates the new state', () => {
    const onChange = vi.fn();
    let state = emptyAvailabilityState();

    const { rerender } = render(
      withIntl(
        <AvailabilityGrid
          value={state}
          onChange={(next) => {
            state = next;
            onChange(next);
          }}
        />,
      ),
    );

    const cell = screen.getByTestId('availability-monday-morning');
    expect(cell.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(cell);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(state.monday).toEqual(['morning']);

    rerender(
      withIntl(
        <AvailabilityGrid
          value={state}
          onChange={(next) => {
            state = next;
            onChange(next);
          }}
        />,
      ),
    );

    expect(
      screen
        .getByTestId('availability-monday-morning')
        .getAttribute('aria-checked'),
    ).toBe('true');

    fireEvent.click(screen.getByTestId('availability-monday-morning'));
    expect(state.monday).toEqual([]);
  });

  it('serializes state to API slots and back', () => {
    const state = emptyAvailabilityState();
    state.monday = ['morning', 'afternoon'];
    state.wednesday = ['evening'];

    const slots = slotsFromState(state);
    expect(slots).toEqual([
      { day: 'monday', from: '08:00', to: '12:00' },
      { day: 'monday', from: '12:00', to: '17:00' },
      { day: 'wednesday', from: '17:00', to: '21:00' },
    ]);

    const round = stateFromSlots(slots);
    expect(round.monday.sort()).toEqual(['afternoon', 'morning']);
    expect(round.wednesday).toEqual(['evening']);
    expect(round.tuesday).toEqual([]);
  });

  it('drops slots that do not match a known period when deserializing', () => {
    const state = stateFromSlots([
      { day: 'monday', from: '08:00', to: '12:00' },
      { day: 'monday', from: '13:00', to: '14:00' }, // unknown period
    ]);
    expect(state.monday).toEqual(['morning']);
  });
});
