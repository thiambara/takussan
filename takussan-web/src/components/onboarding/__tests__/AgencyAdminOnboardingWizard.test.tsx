import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { AgencyAdminOnboardingWizard } from '../AgencyAdminOnboardingWizard';

/** TCK-589 — AC8 : le second facteur de l'administrateur d'agence n'est plus facultatif. */
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@/app/actions/security', () => ({
  twoFactorEnableAction: vi.fn(),
  twoFactorConfirmAction: vi.fn(),
}));

describe('AgencyAdminOnboardingWizard — 2FA obligatoire (AC8)', () => {
  it('l’étape 2FA ne propose plus « Plus tard »', async () => {
    const user = userEvent.setup();
    render(withIntl(<AgencyAdminOnboardingWizard firstName="Awa" agencyName="Dakar Immo" />));

    await user.click(screen.getByRole('button', { name: /Continuer/ }));

    expect(screen.getByRole('button', { name: 'Configurer maintenant' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Plus tard' })).not.toBeInTheDocument();
  });
});
