import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { AgencyAdminOnboardingWizard } from '../AgencyAdminOnboardingWizard';

/**
 * TCK-2615 — l'administrateur d'agence qui finit son assistant arrive sur `/app` sans fenêtre de
 * bienvenue : la sortie marque l'arrivée. L'enrôlement du second facteur est doublé (son sujet est
 * `AgencyAdminOnboardingWizard.test.tsx`) : seul compte ici le geste qui termine.
 */
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('@/components/auth/TotpEnrollment', () => ({
  TotpEnrollment: ({ onComplete }: { onComplete: () => void }) => (
    <button type="button" onClick={onComplete}>
      second facteur activé
    </button>
  ),
}));

describe('AgencyAdminOnboardingWizard — la sortie (TCK-2615)', () => {
  it('terminer marque l’arrivée, puis part vers /app', async () => {
    const user = userEvent.setup();
    render(withIntl(<AgencyAdminOnboardingWizard firstName="Awa" agencyName="Dakar Immo" />));

    await user.click(screen.getByRole('button', { name: /Continuer/ }));
    expect(sessionStorage.getItem('takussan:arrivee-de-parcours')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'second facteur activé' }));

    expect(replace).toHaveBeenCalledWith('/app');
    expect(sessionStorage.getItem('takussan:arrivee-de-parcours')).toContain('"assistant"');
  });
});
