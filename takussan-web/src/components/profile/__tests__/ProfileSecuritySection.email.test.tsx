import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProfileSecuritySection } from '../ProfileSecuritySection';
import { withIntl } from '@/test/intl';

/**
 * TCK-632 — un compte ouvert par téléphone n'a pas d'adresse : la ligne « E-mail » de la sécurité
 * lui disait « consultez votre boîte de réception », vers une boîte qui n'existe pas.
 */
const { compte } = vi.hoisted(() => ({
  compte: { value: null as { email: string | null; email_verified_at: string | null } | null },
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: compte.value }) }));
vi.mock('../security/TwoFactorSection', () => ({ TwoFactorSection: () => null }));
vi.mock('../security/PhoneVerificationSection', () => ({ PhoneVerificationSection: () => null }));
vi.mock('../security/ActiveSessionsSection', () => ({ ActiveSessionsSection: () => null }));
vi.mock('../security/AccountDeletionSection', () => ({ AccountDeletionSection: () => null }));

describe('<ProfileSecuritySection> — ligne e-mail', () => {
  it('sans adresse : renvoie vers les coordonnées, sans badge « Non vérifié »', () => {
    compte.value = { email: null, email_verified_at: null };
    render(withIntl(<ProfileSecuritySection />));

    expect(screen.getByText(/Aucune adresse e-mail sur ce compte/)).toBeInTheDocument();
    expect(screen.queryByText(/boîte de réception/)).not.toBeInTheDocument();
    expect(screen.queryByText('Non vérifié')).not.toBeInTheDocument();
  });

  it('avec une adresse non vérifiée : invite à consulter la boîte', () => {
    compte.value = { email: 'awa@example.sn', email_verified_at: null };
    render(withIntl(<ProfileSecuritySection />));

    expect(screen.getByText(/boîte de réception/)).toBeInTheDocument();
    expect(screen.getByText('Non vérifié')).toBeInTheDocument();
  });
});
