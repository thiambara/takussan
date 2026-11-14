/**
 * P220.04 (TCK-2138) — un membre sans nom ni e-mail (compte créé par téléphone) se nomme, dans la
 * console Équipe, par `nomAffichable()` : prénom et nom, sinon e-mail, sinon numéro, sinon `#<id>`.
 * Avant, la ligne n'en montrait que la pastille `·`, l'`aria-label` des actions finissait par une
 * espace, le tiroir et la confirmation de suspension avaient un titre à trou, et la colonne e-mail
 * rendait un lien `mailto:null`.
 *
 * TCK-2667 — la console est devenue « une personne, une fiche » : la ligne du téléphone
 * (`LigneDuMembre`), le tableau du bureau (`TableDesMembres`) et la fiche (`FicheDuMembre`)
 * remplacent `AdminUsersTable` et `UserDetailDrawer`. La règle du nom les suit.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { ConfirmSuspendDialog } from '../ConfirmSuspendDialog';
import { FicheDuMembre } from '../equipe/FicheDuMembre';
import { LigneDuMembre } from '../equipe/LigneDuMembre';
import { TableDesMembres } from '../equipe/TableDesMembres';
import type { AdminAgencyUserRow } from '@/types/admin-users';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, token: null, isLoading: false }) }));
vi.mock('@/components/admin/users/UserRolesEditor', () => ({ UserRolesEditor: () => null }));

const AGENCE = 3;

function membre(over: Partial<AdminAgencyUserRow> = {}): AdminAgencyUserRow {
  return {
    id: 42,
    first_name: '',
    last_name: '',
    email: null,
    phone: '+221770000622',
    status: 'active',
    last_login_at: null,
    created_at: '2026-01-01T00:00:00+00:00',
    agent_profiles: [{ agency_id: AGENCE, status: 'active' }],
    ...over,
  };
}

function table(membres: AdminAgencyUserRow[]) {
  return render(
    withIntl(
      <TableDesMembres
        membres={membres}
        agencyId={AGENCE}
        currentUserId={1}
        affectations={new Map()}
        tri="-created_at"
        onTrier={vi.fn()}
        selectionne={null}
        onOuvrir={vi.fn()}
        suspensionDe={() => null}
        onSuspension={vi.fn()}
      />,
    ),
  );
}

describe('console Équipe — membre sans nom (P220.04)', () => {
  it('nomme la ligne du tableau par le numéro, garde une initiale lisible et nomme les actions', () => {
    table([membre()]);
    const ligne = within(screen.getByTestId('membre-42'));
    expect(ligne.getByText('+221 77 000 06 22')).toBeInTheDocument();
    expect(ligne.getByRole('button', { name: 'Actions de +221 77 000 06 22' })).toBeInTheDocument();
  });

  it('ne rend ni lien `mailto:` ni « null » quand l’e-mail est nul', () => {
    table([membre()]);
    const ligne = screen.getByTestId('membre-42');
    expect(ligne.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(ligne.textContent).not.toContain('null');
  });

  it("retombe sur l'e-mail, puis sur #<id>", () => {
    table([membre({ id: 7, email: 'awa@example.test', phone: null }), membre({ id: 8, phone: null })]);
    expect(within(screen.getByTestId('membre-7')).getAllByText('awa@example.test').length).toBeGreaterThanOrEqual(1);
    expect(within(screen.getByTestId('membre-8')).getByText('#8')).toBeInTheDocument();
  });

  it('la ligne du téléphone se nomme de même', () => {
    render(withIntl(<LigneDuMembre membre={membre()} agencyId={AGENCE} currentUserId={1} onOuvrir={vi.fn()} />));
    expect(screen.getByRole('button', { name: /\+221 77 000 06 22/ })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('null');
  });

  it('la fiche porte le même nom, et son lien `mailto:` seulement quand l’e-mail existe', () => {
    const client = new QueryClient();
    const monter = (m: AdminAgencyUserRow) =>
      render(
        withIntl(
          <QueryClientProvider client={client}>
            <FicheDuMembre
              membre={m}
              agencyId={AGENCE}
              currentUserId={1}
              affectations={[]}
              peutAttribuerLeRole={false}
              peutLireLePortefeuille={false}
              suspension={null}
              onSuspension={vi.fn()}
              peutDeleguer={false}
              onCouvrir={vi.fn()}
            />
          </QueryClientProvider>,
        ),
      );
    const { unmount } = monter(membre());
    const fiche = screen.getByTestId('fiche-du-membre');
    expect(within(fiche).getAllByText('+221 77 000 06 22').length).toBeGreaterThanOrEqual(1);
    expect(fiche.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(fiche.textContent).not.toContain('null');
    unmount();
    monter(membre({ first_name: 'Awa', last_name: 'Diop', email: 'awa@example.test' }));
    expect(screen.getByText('Awa Diop')).toBeInTheDocument();
    expect(screen.getByTestId('fiche-du-membre').querySelector('a[href="mailto:awa@example.test"]')).not.toBeNull();
  });

  it('nomme le membre dans la confirmation de suspension', () => {
    render(withIntl(<ConfirmSuspendDialog target={{ member: membre({ phone: null }), action: 'suspend' }} onCancel={vi.fn()} onConfirm={vi.fn()} />));
    expect(screen.getByText("Suspendre #42 de l'agence ?")).toBeInTheDocument();
  });
});
