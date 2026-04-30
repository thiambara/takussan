import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PropertyVisitDialog } from '../PropertyVisitDialog';

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

describe('<PropertyVisitDialog>', () => {
  beforeEach(() => {
    submit.mockReset();
    submit.mockResolvedValue(undefined);
    authUser = null;
  });

  it('renders the form with type selector and visitor fields for anonymous users', () => {
    render(<PropertyVisitDialog slug="villa-almadies" open={true} onOpenChange={() => {}} />);

    expect(screen.getByText(/demander une visite/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/votre nom/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/téléphone/i)).toBeInTheDocument();
  });

  it('hides visitor fields when the user is authenticated', () => {
    authUser = { id: 5 };
    render(<PropertyVisitDialog slug="villa-almadies" open={true} onOpenChange={() => {}} />);

    expect(screen.queryByPlaceholderText(/votre nom/i)).not.toBeInTheDocument();
  });

  it('submits the chosen type + date/time + anonymous identity', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();

    render(
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

    await user.type(screen.getByPlaceholderText(/votre nom/i), 'Awa');
    await user.type(screen.getByPlaceholderText(/email/i), 'awa@example.com');
    await user.type(screen.getByPlaceholderText(/téléphone/i), '+221770000000');

    await user.click(screen.getByRole('button', { name: /demander la visite/i }));

    await waitFor(() => {
      expect(submit).toHaveBeenCalled();
    });

    const payload = submit.mock.calls[0][0];
    expect(payload.type).toBe('in_person');
    expect(payload.visitor_name).toBe('Awa');
    expect(payload.visitor_email).toBe('awa@example.com');
    expect(payload.visitor_phone).toBe('+221770000000');
    expect(payload.scheduled_at).toMatch(/^2027-05-10T/);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSuccess).toHaveBeenCalled();
  });
});
