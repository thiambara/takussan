/**
 * TCK-586, AC10 — la fiche utilisateur de la console parle français.
 *
 * Le badge du prestataire disait « Service provider » dans la console française, à côté du badge
 * du courtier que ce ticket retire (ADR-0030).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { AdminUserDetail } from '@/types/super-admin';
import { withIntl } from '@/test/intl';
import { UserProfilesSection } from '../user-detail';

function prestataire(): AdminUserDetail {
  return {
    id: 7,
    username: 'awa',
    first_name: 'Awa',
    last_name: 'Ndiaye',
    full_name: 'Awa Ndiaye',
    email: 'awa@example.test',
    phone: null,
    status: 'active',
    preferred_language: 'fr',
    timezone: null,
    email_verified_at: null,
    phone_verified_at: null,
    last_login_at: null,
    two_factor_enabled: false,
    mfa_enabled: false,
    created_at: null,
    roles: [{ name: 'service_provider', team_id: null }],
    profiles: { agent: [], owner: [], service_provider: { id: 3, status: 'active' } },
    agencies: [],
  } as AdminUserDetail;
}

describe('UserProfilesSection', () => {
  it('nomme le prestataire en français', () => {
    render(withIntl(<UserProfilesSection user={prestataire()} />));

    expect(screen.getByText('Prestataire')).toBeInTheDocument();
    expect(screen.queryByText('Service provider')).not.toBeInTheDocument();
  });
});
