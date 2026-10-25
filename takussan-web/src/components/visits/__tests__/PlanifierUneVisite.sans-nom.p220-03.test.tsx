import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { PlanifierUneVisite } from '../PlanifierUneVisite';

/**
 * P220.03 (TCK-2281) — une fiche client née d'un compte créé par téléphone garde prénom et nom
 * vides. Décision du porteur : chaque écran la nomme par `nomAffichable()` (e-mail, numéro, `#<id>`),
 * avec les seuls champs qu'il charge déjà ; avant, il composait une chaîne vide.
 *
 * La recherche ne demande que `id`, `first_name` et `last_name` : une fiche sans nom y retombe
 * sur `#<id>`, et ne laisse plus une option vide.
 */
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({
    data: {
      data: [{ id: 'agent:9', type: 'agent', numeric_id: 9, agency_id: 3, status: 'active', created_at: null }],
      meta: { active_profile_id: 'agent:9', count: 1 },
    },
  }),
}));
vi.mock('@/lib/queries/visits', () => ({ usePlanVisit: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (_key: unknown, chemin: string) =>
    chemin === '/api/properties'
      ? { data: { data: [] } }
      : { data: { data: [{ id: 45, first_name: '', last_name: '' }, { id: 46, first_name: 'Awa', last_name: null }] } },
}));

describe('<PlanifierUneVisite> — fiche sans nom (P220.03)', () => {
  it('le sélecteur de client nomme la fiche sans nom par #<id>', async () => {
    const user = userEvent.setup();
    render(withIntl(<PlanifierUneVisite property={{ id: 10, libelle: 'Villa à Almadies' }} />));
    await user.click(screen.getByRole('button', { name: 'Planifier une visite' }));
    await screen.findByRole('dialog');

    expect(screen.getByRole('option', { name: '#45' })).toHaveValue('45');
    expect(screen.getByRole('option', { name: 'Awa' })).toHaveValue('46');
  });
});
