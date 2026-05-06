import { describe, it, expect, vi, beforeEach } from 'vitest';
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

  it('submits the chosen type + date/time without nullable empty notes', async () => {
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

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    await user.clear(dateInput);
    await user.type(dateInput, '2027-05-10');

    await user.click(screen.getByRole('button', { name: /demander la visite/i }));

    await waitFor(() => {
      expect(submit).toHaveBeenCalled();
    });

    const payload = submit.mock.calls[0][0];
    expect(payload.type).toBe('in_person');
    expect(payload.notes).toBeUndefined();
    expect(payload.scheduled_at).toMatch(/^2027-05-10T/);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSuccess).toHaveBeenCalled();
  });
});
