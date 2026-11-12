import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import type { Profile } from '@/types/profile';

/**
 * TCK-2635 (AC2) — « Mes espaces » ne montre plus le code : ni `license_number` ni `tax_id` dans les
 * aides KYC, ni le statut brut après un point médian (« · active ») ; le statut se dit (« Actif »).
 */
const PROFILS: Profile[] = [
  { id: 'agent:3', type: 'agent', numeric_id: 3, agency_id: 1, status: 'active', created_at: null },
  { id: 'owner:7', type: 'owner', numeric_id: 7, agency_id: null, status: 'suspended', created_at: null },
  // Un statut que le front ne connaît pas encore ne s'affiche pas plutôt qu'en code.
  { id: 'service_provider:2', type: 'service_provider', numeric_id: 2, agency_id: null, status: 'en_revue', created_at: null },
];

vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({
    data: { data: PROFILS, meta: { active_profile_id: 'agent:3' } },
    isLoading: false,
    isError: false,
  }),
}));

const { MyProfilesSection } = await import('../MyProfilesSection');

describe('<MyProfilesSection> — le vocabulaire de l’utilisateur (TCK-2635, AC2)', () => {
  it('aucun nom de colonne, aucun statut en code après un point médian', () => {
    const { container } = render(withIntl(<MyProfilesSection />));
    const texte = container.textContent ?? '';

    expect(texte).not.toMatch(/license_number|tax_id/);
    expect(texte).not.toMatch(/·\s*[a-z_]+\b/);
    expect(texte).not.toContain('en_revue');
  });

  it('le statut se dit, et les champs KYC portent leur nom d’usage', () => {
    render(withIntl(<MyProfilesSection />));
    expect(screen.getByText('· Actif')).toBeInTheDocument();
    expect(screen.getByText('Carte professionnelle')).toBeInTheDocument();
    expect(screen.getByText('Identifiant fiscal')).toBeInTheDocument();
  });
});
