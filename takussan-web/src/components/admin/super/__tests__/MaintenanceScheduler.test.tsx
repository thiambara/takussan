import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { cancelMaintenance, scheduleMaintenance } from '@/lib/queries/super-admin';
import type { MaintenanceStatus } from '@/types/super-admin';
import { MaintenanceScheduler } from '../maintenance';

vi.mock('@/lib/queries/super-admin', () => ({
  cancelMaintenance: vi.fn(),
  scheduleMaintenance: vi.fn(),
}));

// The scheduler now uses our shadcn `<DateTimePicker>` (button + popover).
// In jsdom we shim it back to a native `datetime-local` input so the
// existing test (which types into the field) keeps its intent without
// depending on the popover internals.
vi.mock('@/components/ui/date-time-picker', () => ({
  DateTimePicker: ({
    id,
    value,
    onValueChange,
  }: {
    id?: string;
    value?: string;
    onValueChange: (v: string) => void;
  }) => (
    <input
      id={id}
      type="datetime-local"
      value={value ?? ''}
      onChange={(e) => onValueChange(e.target.value)}
    />
  ),
}));

const emptyStatus: MaintenanceStatus = {
  active: false,
  show_banner: false,
  window: null,
  generated_at: '2026-05-07T10:00:00.000Z',
};

function renderScheduler(status = emptyStatus) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MaintenanceScheduler status={status} />
    </QueryClientProvider>,
  );
}

describe('<MaintenanceScheduler>', () => {
  it('schedules a maintenance window', async () => {
    vi.mocked(scheduleMaintenance).mockResolvedValue({ data: emptyStatus });
    const user = userEvent.setup();
    renderScheduler();

    await user.type(screen.getByLabelText(/Début/i), '2026-05-08T10:00');
    await user.type(screen.getByLabelText(/Fin/i), '2026-05-08T11:00');
    await user.click(screen.getByRole('button', { name: /Lecture seule/i }));
    await user.click(screen.getByRole('button', { name: /Programmer/i }));

    await waitFor(() => expect(scheduleMaintenance).toHaveBeenCalled());
    expect(vi.mocked(scheduleMaintenance).mock.calls[0][0].mode).toBe('read_only');
  });

  it('cancels an existing window', async () => {
    vi.mocked(cancelMaintenance).mockResolvedValue({ data: emptyStatus });
    const user = userEvent.setup();
    renderScheduler({
      ...emptyStatus,
      window: {
        id: 1,
        starts_at: '2026-05-08T10:00:00.000Z',
        ends_at: '2026-05-08T11:00:00.000Z',
        mode: 'banner',
        severity: 'scheduled',
        messages: { fr: 'Maintenance planifiée' },
        banner_lead_minutes: 30,
      },
    });

    await user.click(screen.getByRole('button', { name: /Annuler la fenêtre/i }));

    await waitFor(() => expect(cancelMaintenance).toHaveBeenCalled());
  });
});
