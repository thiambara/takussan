import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { PropertyVisitDialog } from '../PropertyVisitDialog';
import messages from '@/messages/fr.json';

const submit = vi.fn();

vi.mock('@/hooks/useVisitRequest', () => ({
  useVisitRequest: () => ({
    submit,
    submitting: false,
    error: null,
  }),
}));

let authUser: { id: number } | null = null;
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: authUser, token: null, isLoading: false }),
}));

function renderDialog(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="fr" messages={messages} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  );
}

describe('<PropertyVisitDialog>', () => {
  beforeEach(() => {
    submit.mockReset();
    submit.mockResolvedValue(undefined);
    authUser = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('prompts anonymous users to log in before requesting a visit', () => {
    renderDialog(<PropertyVisitDialog slug="villa-almadies" open={true} onOpenChange={() => {}} />);

    expect(screen.getByText(/connectez-vous pour visiter/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /se connecter/i })).toHaveAttribute(
      'href',
      '/auth/login?redirect=/properties/villa-almadies',
    );
    expect(screen.queryByText(/type de visite/i)).not.toBeInTheDocument();
  });

  it('renders the visit form when the user is authenticated', () => {
    authUser = { id: 5 };
    renderDialog(<PropertyVisitDialog slug="villa-almadies" open={true} onOpenChange={() => {}} />);

    expect(screen.getByText(/demander une visite/i)).toBeInTheDocument();
    expect(screen.getByText(/type de visite/i)).toBeInTheDocument();
  });

  it('keeps the submit button disabled until a date is selected', () => {
    authUser = { id: 5 };
    renderDialog(<PropertyVisitDialog slug="villa-almadies" open={true} onOpenChange={() => {}} />);

    const submitBtn = screen.getByRole('button', { name: /demander la visite/i });
    expect(submitBtn).toBeDisabled();
  });

  it('filters out past time slots when today is selected', async () => {
    // Freeze "now" at 14:00 today; 9:00-14:00 should disappear, 14:30+ stays.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2027-05-15T14:00:00'));
    authUser = { id: 5 };

    const user = userEvent.setup();
    renderDialog(<PropertyVisitDialog slug="villa-almadies" open={true} onOpenChange={() => {}} />);

    // Pick today via the calendar
    await user.click(screen.getByRole('button', { name: 'Date' }));
    const today15 = await screen.findByRole('button', { name: /15 mai 2027/i });
    await user.click(today15);

    // Open the time select; only future slots should appear in the listbox.
    await user.click(screen.getByRole('combobox', { name: /heure/i }));
    const options = await screen.findAllByRole('option');
    const labels = options.map((o) => o.textContent?.trim());

    // 14:00 already passed (cutoff = 14:00 + 30min = 14:30). 9:00 also gone.
    expect(labels).not.toContain('09:00');
    expect(labels).not.toContain('14:00');
    expect(labels).toContain('14:30');
    expect(labels).toContain('19:00');
  });

  it('submits the chosen date + default type via the Calendar popover', async () => {
    // Freeze "now" at the 1st of a known month so the calendar opens on it
    // and day "15" is a guaranteed future day in the same grid.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2027-05-01T08:00:00'));

    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();
    authUser = { id: 5 };

    renderDialog(
      <PropertyVisitDialog
        slug="villa-almadies"
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />,
    );

    // Open the calendar popover. The trigger is labelled by its <label>
    // ("Date") because of the htmlFor association.
    await user.click(screen.getByRole('button', { name: 'Date' }));

    // Pick day 15 — react-day-picker labels day cells with the localized
    // full date (e.g. "samedi 15 mai 2027"). Match it loosely.
    const day15 = await screen.findByRole('button', { name: /15 mai 2027/i });
    await user.click(day15);

    await user.click(screen.getByRole('button', { name: /demander la visite/i }));

    await waitFor(() => {
      expect(submit).toHaveBeenCalled();
    });

    const payload = submit.mock.calls[0][0];
    expect(payload.type).toBe('in_person');
    expect(payload.notes).toBeUndefined();
    // Date should be May 15, 2027 at 10:00 local (default time)
    expect(payload.scheduled_at).toMatch(/2027-05-1[45]/);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSuccess).toHaveBeenCalled();
  });
});
