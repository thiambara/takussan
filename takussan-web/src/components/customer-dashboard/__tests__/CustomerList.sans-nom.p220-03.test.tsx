import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CustomerList } from '@/components/customer-dashboard/CustomerList';
import { withIntl } from '@/test/intl';

/**
 * P220.03 (TCK-2281) — une fiche client née d'un compte créé par téléphone garde prénom et nom
 * vides. Décision du porteur : chaque écran la nomme par `nomAffichable()` (e-mail, numéro, `#<id>`),
 * avec les seuls champs qu'il charge déjà ; avant, il composait une chaîne vide.
 */
describe('CustomerList — fiche sans nom (P220.03)', () => {
  it('la ligne du tableau et la carte mobile la nomment par son numéro', () => {
    render(withIntl(
      <CustomerList
        page={{
          data: [{
            id: 424,
            first_name: '',
            last_name: '',
            email: null,
            phone: '+221770000622',
            status: 'active',
            pipeline_stage: 'lead',
            occupation: null,
            created_at: '2026-05-06T10:00:00.000Z',
          }],
          meta: { total: 1, current_page: 1, last_page: 1, per_page: 20 },
          links: { first: null, last: null, prev: null, next: null },
        }}
      />,
    ));

    const liens = screen.getAllByRole('link', { name: /\+221 77 000 06 22/ });
    expect(liens.length).toBe(2);
    liens.forEach((lien) => expect(lien).toHaveAttribute('href', '/app/customers/424'));
  });
});
