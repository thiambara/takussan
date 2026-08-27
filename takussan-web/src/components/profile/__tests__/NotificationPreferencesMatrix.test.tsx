import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationPreferencesMatrix } from '../NotificationPreferencesMatrix';
import { withIntl } from '@/test/intl';

const getMock = vi.fn();
const updateMock = vi.fn();

vi.mock('@/app/actions/notification-preferences', () => ({
  getNotificationPreferencesAction: () => getMock(),
  updateNotificationPreferencesAction: (prefs: unknown) => updateMock(prefs),
}));

function buildGrid(overrides: Array<{ event: string; channel: string; enabled?: boolean; locked?: boolean; reason?: string }> = []) {
  const events = [
    'message_received',
    'booking_request',
    'booking_status_changed',
    'lease_payment_due',
    'lease_payment_overdue',
    'maintenance_status_changed',
    'review_received',
    'saved_search_match',
    'visit_reminder',
    'threshold_alert',
  ];
  const channels: Array<'inapp' | 'email' | 'push' | 'sms'> = [
    'inapp',
    'email',
    'push',
    'sms',
  ];

  const preferences = events.flatMap((event) =>
    channels.map((channel) => {
      const override = overrides.find(
        (o) => o.event === event && o.channel === channel,
      );
      const locked =
        channel === 'inapp' ||
        (channel === 'sms') ||
        override?.locked ||
        false;
      const reason =
        channel === 'inapp'
          ? 'inapp_always_on'
          : channel === 'sms'
            ? 'phone_not_verified'
            : override?.reason;
      return {
        event_type: event,
        channel,
        enabled:
          channel === 'inapp'
            ? true
            : channel === 'sms'
              ? false
              : (override?.enabled ?? true),
        locked,
        ...(reason ? { reason } : {}),
      };
    }),
  );

  return {
    preferences,
    events,
    channels,
    phone_verified: false,
  };
}

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('<NotificationPreferencesMatrix>', () => {
  beforeEach(() => {
    getMock.mockReset();
    updateMock.mockReset();
  });

  it('renders the grouped matrix from the API response', async () => {
    getMock.mockResolvedValue({ ok: true, data: buildGrid() });
    render(wrap(<NotificationPreferencesMatrix />));

    await waitFor(() => expect(screen.getByText('Nouveau message')).toBeInTheDocument());
    // ⚠ « Réservations » apparaît DEUX fois depuis TCK-380 : le titre visible du groupe, et la
    // `<caption class="sr-only">` que `DataTable` pose sur chaque table — la légende que la table
    // faite main n'avait pas. Le test vise donc le titre, et le second `getAllByText` prouve que
    // la légende existe bien plutôt que de la laisser disparaître sans bruit.
    expect(screen.getByRole('heading', { name: 'Réservations' })).toBeInTheDocument();
    expect(screen.getAllByText('Réservations')).toHaveLength(2);
    expect(screen.getByText(/téléphone n'est pas vérifié/i)).toBeInTheDocument();
  });

  /**
   * TCK-380 · AC3 — la matrice convertie garde ses colonnes, dans l'ordre : l'événement d'abord,
   * puis UN canal par colonne, dans l'ordre rendu par l'API. Relevé sur les `<th>` de la table
   * faite main à la révision `73ca883b`.
   */
  it('garde ses colonnes après le passage sur DataTable (AC3 de TCK-380)', async () => {
    getMock.mockResolvedValue({ ok: true, data: buildGrid() });
    render(wrap(<NotificationPreferencesMatrix />));

    await waitFor(() => expect(screen.getByText('Nouveau message')).toBeInTheDocument());

    const table = screen.getByRole('table', { name: 'Messages' });
    const entetes = within(table)
      .getAllByRole('columnheader')
      .map((th) => th.textContent?.trim());
    expect(entetes).toEqual(['Événement', 'In-app', 'Email', 'Push', 'SMS']);
  });

  it('toggles a cell and calls the update action', async () => {
    const user = userEvent.setup();
    const initial = buildGrid();
    getMock.mockResolvedValue({ ok: true, data: initial });
    updateMock.mockResolvedValue({ ok: true, data: initial });

    render(wrap(<NotificationPreferencesMatrix />));
    await waitFor(() => screen.getByText('Nouveau message'));

    const checkbox = screen.getByRole('checkbox', {
      name: /Nouveau message.*Email/i,
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(checkbox).not.toBeDisabled();

    await user.click(checkbox);
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith([
        { event_type: 'message_received', channel: 'email', enabled: false },
      ]),
    );
  });

  it('keeps rendering after a save response without metadata', async () => {
    const user = userEvent.setup();
    const initial = buildGrid();
    const updated = buildGrid([
      { event: 'message_received', channel: 'email', enabled: false },
    ]);
    getMock.mockResolvedValue({ ok: true, data: initial });
    updateMock.mockResolvedValue({
      ok: true,
      data: { preferences: updated.preferences },
    });

    render(wrap(<NotificationPreferencesMatrix />));
    await waitFor(() => screen.getByText('Nouveau message'));

    const checkbox = screen.getByRole('checkbox', {
      name: /Nouveau message.*Email/i,
    }) as HTMLInputElement;

    await user.click(checkbox);

    await waitFor(() =>
      expect(screen.getByText('Préférences enregistrées.')).toBeInTheDocument(),
    );
    expect(screen.getByText('Nouveau message')).toBeInTheDocument();
    expect(checkbox.checked).toBe(false);
    expect(
      screen.getByRole('checkbox', { name: /Nouveau message.*SMS/i }),
    ).toBeDisabled();
  });

  it('disables locked cells (inapp always on, sms without verified phone)', async () => {
    getMock.mockResolvedValue({ ok: true, data: buildGrid() });
    render(wrap(<NotificationPreferencesMatrix />));
    await waitFor(() => screen.getByText('Nouveau message'));

    // inapp checkbox for a given event is always checked + disabled
    const inappBox = screen.getByRole('checkbox', {
      name: /Nouveau message.*In-app/i,
    }) as HTMLInputElement;
    expect(inappBox.checked).toBe(true);
    expect(inappBox).toBeDisabled();

    // sms checkbox for a given event is unchecked + disabled (phone not verified)
    const smsBox = screen.getByRole('checkbox', {
      name: /Nouveau message.*SMS/i,
    }) as HTMLInputElement;
    expect(smsBox).toBeDisabled();
    expect(smsBox.checked).toBe(false);
  });

  it('surfaces the server error from the query', async () => {
    getMock.mockResolvedValue({ ok: false, message: 'Preference endpoint down.' });
    render(wrap(<NotificationPreferencesMatrix />));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Preference endpoint down.'),
    );
  });

  it('renders one row per canonical event', async () => {
    getMock.mockResolvedValue({ ok: true, data: buildGrid() });
    render(wrap(<NotificationPreferencesMatrix />));
    await waitFor(() => screen.getByText('Nouveau message'));

    // Every display label mapped in the component should appear.
    for (const label of [
      'Nouveau message',
      'Demande de réservation',
      'Réservation — statut modifié',
      'Loyer — échéance',
      'Loyer — retard',
      'Maintenance — statut',
      'Nouvel avis',
      'Recherche sauvegardée',
      'Rappel de visite',
      'Alerte seuil KPI',
    ]) {
      const section = screen.getByText(label);
      expect(section).toBeInTheDocument();
      // Make sure each row has exactly 4 checkboxes.
      const row = section.closest('tr');
      expect(row).not.toBeNull();
      expect(within(row as HTMLElement).getAllByRole('checkbox')).toHaveLength(4);
    }
  });
});
