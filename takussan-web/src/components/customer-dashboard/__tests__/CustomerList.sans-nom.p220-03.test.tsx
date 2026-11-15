import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ListeDesClients } from '@/components/customer-dashboard/liste/ListeDesClients';
import { withIntl } from '@/test/intl';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/app/customers',
}));

/**
 * P220.03 (TCK-2281) — une fiche client née d'un compte créé par téléphone garde prénom et nom
 * vides. Décision du porteur : chaque écran la nomme par `nomAffichable()` (e-mail, numéro, `#<id>`),
 * avec les seuls champs qu'il charge déjà ; avant, il composait une chaîne vide.
 *
 * TCK-2590 — la liste est désormais `ListeDesClients` (ligne du téléphone et tableau du bureau).
 */
describe('ListeDesClients — fiche sans nom (P220.03)', () => {
  it('la ligne du tableau et la ligne du téléphone la nomment par son numéro', () => {
    render(withIntl(
      <QueryClientProvider client={new QueryClient()}>
        <ListeDesClients
          page={{
            data: [{
              id: 424,
              first_name: '',
              last_name: '',
              email: null,
              phone: '+221770000622',
              status: 'active',
              pipeline_stage: 'lead',
              created_at: '2026-05-06T10:00:00.000Z',
            }],
            meta: { total: 1, current_page: 1, last_page: 1, per_page: 20 },
            links: { first: null, last: null, prev: null, next: null },
          }}
          vue="tous"
          tri="next_action_at"
          vues={[]}
          comptes={{}}
          personnel={false}
          admin={false}
          crmTags={[]}
          filtre={false}
        />
      </QueryClientProvider>,
    ));

    const liens = screen.getAllByRole('link', { name: /^\+221 ?77 ?000 ?06 ?22$/ });
    expect(liens.length).toBe(2);
    liens.forEach((lien) => expect(lien).toHaveAttribute('href', '/app/customers/424'));
  });
});
