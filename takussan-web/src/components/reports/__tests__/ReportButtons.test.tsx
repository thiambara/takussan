import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/test/intl';
import { submitPropertyReport, submitReviewReport } from '@/app/actions/property';
import { PropertyReportButton } from '@/app/[locale]/(public)/properties/[slug]/components/PropertyReportButton';
import { ReviewReportButton } from '../ReviewReportButton';

/**
 * TCK-597 (V12) — signaler sans compte. Avant, un visiteur sans session qui cliquait
 * « Signaler cette annonce » tombait sur « Connexion requise » et aucun formulaire.
 */
vi.mock('@/app/actions/property', () => ({
  submitPropertyReport: vi.fn(),
  submitReviewReport: vi.fn(),
}));

const session = vi.hoisted(() => ({ user: null as null | { id: number } }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: session.user }) }));

describe('signaler sans compte', () => {
  beforeEach(() => {
    session.user = null;
    vi.mocked(submitPropertyReport).mockReset().mockResolvedValue({ ok: true });
    vi.mocked(submitReviewReport).mockReset().mockResolvedValue({ ok: true });
  });

  it('un visiteur sans session signale une annonce, motif « arnaque » par défaut', async () => {
    const user = userEvent.setup();
    render(withIntl(<PropertyReportButton slug="villa-7" />));

    await user.click(screen.getByRole('button', { name: /signaler cette annonce/i }));
    expect(screen.queryByText(/connexion requise/i)).toBeNull();
    await user.click(screen.getByRole('button', { name: /^signaler$/i }));

    await waitFor(() => expect(submitPropertyReport).toHaveBeenCalledTimes(1));
    expect(vi.mocked(submitPropertyReport).mock.calls[0]).toEqual(['villa-7', { reason: 'fraud', details: undefined, company: undefined }]);
    // La confirmation dit la vérité : « nous allons examiner », et ne promet aucun suivi à un
    // visiteur que l'API ne sait pas prévenir.
    expect(screen.getByRole('status')).toHaveTextContent(/nous allons examiner/i);
    expect(screen.getByRole('status')).not.toHaveTextContent(/prévenu/i);
  });

  it('un visiteur connecté apprend qu’il sera prévenu de l’issue', async () => {
    session.user = { id: 7 };
    const user = userEvent.setup();
    render(withIntl(<PropertyReportButton slug="villa-7" />));

    await user.click(screen.getByRole('button', { name: /signaler cette annonce/i }));
    await user.click(screen.getByRole('button', { name: /^signaler$/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/prévenu de l'issue/i);
  });

  it('un avis public porte son « Signaler », sans champ libre', async () => {
    const user = userEvent.setup();
    render(withIntl(<ReviewReportButton reviewId={42} />));

    await user.click(screen.getByRole('button', { name: /signaler cet avis/i }));
    expect(screen.queryByLabelText(/détails/i)).toBeNull();
    await user.click(screen.getByRole('button', { name: /^signaler$/i }));

    await waitFor(() => expect(submitReviewReport).toHaveBeenCalledWith(42, { reason: 'fraud', details: undefined, company: undefined }));
  });

  it('une erreur de l’API s’affiche, le formulaire reste ouvert', async () => {
    vi.mocked(submitReviewReport).mockResolvedValue({ ok: false, message: 'Trop de signalements.' });
    const user = userEvent.setup();
    render(withIntl(<ReviewReportButton reviewId={42} />));

    await user.click(screen.getByRole('button', { name: /signaler cet avis/i }));
    await user.click(screen.getByRole('button', { name: /^signaler$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Trop de signalements.');
  });
});
