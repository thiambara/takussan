/**
 * P230.04 (TCK-2234) — la fenêtre de maintenance ne se programme plus dans le passé :
 * `StoreMaintenanceRequest` exige `starts_at` `after_or_equal:now` (TCK-218). Le début a pour `min`
 * l'instant présent, la fin le début choisi, à défaut l'instant présent. La primitive ne grise que
 * des JOURS (`date-time-picker.tsx`) : la minute en cours reste choisissable, et c'est le reste de
 * la piste.
 */
process.env.TZ = 'Africa/Dakar';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MaintenanceStatus } from '@/types/super-admin';
import { withIntl } from '@/test/intl';
import { MaintenanceScheduler } from '../maintenance';

vi.mock('@/lib/queries/super-admin', () => ({
  cancelMaintenance: vi.fn(),
  scheduleMaintenance: vi.fn(),
}));

const sansFenetre: MaintenanceStatus = {
  active: false,
  show_banner: false,
  window: null,
  generated_at: '2026-10-25T10:00:00.000Z',
};

function monter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      <MaintenanceScheduler status={sansFenetre} />
    </QueryClientProvider>,
  ));
}

async function ouvrir(user: ReturnType<typeof userEvent.setup>, id: string): Promise<HTMLElement> {
  await user.click(document.getElementById(id) as HTMLElement);
  return screen.findByRole('dialog');
}

describe('MaintenanceScheduler — bornes de la fenêtre (P230.04)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-10-25T10:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('la veille est grisée dans le début et dans la fin', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    monter();

    const debut = await ouvrir(user, 'maintenance-start');
    expect(within(debut).getByRole('button', { name: /24 octobre 2026/i })).toBeDisabled();
    expect(within(debut).getByRole('button', { name: /25 octobre 2026/i })).toBeEnabled();
    await user.keyboard('{Escape}');

    const fin = await ouvrir(user, 'maintenance-end');
    expect(within(fin).getByRole('button', { name: /24 octobre 2026/i })).toBeDisabled();
    expect(within(fin).getByRole('button', { name: /25 octobre 2026/i })).toBeEnabled();
  });

  it('la fin commence au jour du début choisi', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    monter();

    const debut = await ouvrir(user, 'maintenance-start');
    await user.click(within(debut).getByRole('button', { name: /28 octobre 2026/i }));
    await user.keyboard('{Escape}');

    const fin = await ouvrir(user, 'maintenance-end');
    expect(within(fin).getByRole('button', { name: /27 octobre 2026/i })).toBeDisabled();
    expect(within(fin).getByRole('button', { name: /28 octobre 2026/i })).toBeEnabled();
  });
});
