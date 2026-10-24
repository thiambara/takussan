/**
 * P220.04 (TCK-2138) — un membre sans nom ni e-mail (compte créé par téléphone) se nomme, dans la
 * console Équipe, par `nomAffichable()` : prénom et nom, sinon e-mail, sinon numéro, sinon `#<id>`.
 * Avant, la ligne n'en montrait que la pastille `·`, l'`aria-label` des actions finissait par une
 * espace, le tiroir et la confirmation de suspension avaient un titre à trou, et la colonne e-mail
 * rendait un lien `mailto:null`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { ConfirmSuspendDialog } from '../ConfirmSuspendDialog';
import { AdminUsersTable } from '../users/AdminUsersTable';
import { UserDetailDrawer } from '../users/UserDetailDrawer';
import type { AdminAgencyUserRow } from '@/types/admin-users';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

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
    roles: ['agent'],
    ...over,
  };
}

describe('console Équipe — membre sans nom (P220.04)', () => {
  it('nomme la ligne par le numéro, garde une initiale lisible et nomme les actions', () => {
    render(withIntl(
      <AdminUsersTable rows={[membre()]} total={1} currentUserId={1} onSelect={vi.fn()} onRemove={vi.fn()} />,
    ));

    const ligne = within(screen.getByTestId('admin-user-row-42'));
    expect(ligne.getByText('+221 77 000 06 22')).toBeInTheDocument();
    expect(ligne.getByRole('button', { name: 'Actions pour +221 77 000 06 22' })).toBeInTheDocument();
  });

  it("rend la colonne e-mail à « — », sans lien, quand l'e-mail est nul", () => {
    render(withIntl(<AdminUsersTable rows={[membre()]} total={1} currentUserId={1} onSelect={vi.fn()} />));

    const ligne = screen.getByTestId('admin-user-row-42');
    expect(ligne.querySelector('a[href^="mailto:"]')).toBeNull();
    const cellules = Array.from(ligne.querySelectorAll('td')).map((td) => td.textContent?.trim());
    expect(cellules[1]).toBe('—');
    expect(ligne.textContent).not.toContain('null');
  });

  it("retombe sur l'e-mail, puis sur #<id>", () => {
    render(withIntl(
      <AdminUsersTable
        rows={[membre({ id: 7, email: 'awa@example.test', phone: null }), membre({ id: 8, phone: null })]}
        total={2}
        currentUserId={1}
        onSelect={vi.fn()}
      />,
    ));

    const parEmail = within(screen.getByTestId('admin-user-row-7'));
    expect(parEmail.getAllByText('awa@example.test').length).toBeGreaterThanOrEqual(2);
    expect(within(screen.getByTestId('admin-user-row-8')).getByText('#8')).toBeInTheDocument();
  });

  it('un membre nommé garde son nom et son lien mailto', () => {
    render(withIntl(
      <AdminUsersTable
        rows={[membre({ id: 9, first_name: 'Awa', last_name: 'Diop', email: 'awa@example.test' })]}
        total={1}
        currentUserId={1}
        onSelect={vi.fn()}
      />,
    ));

    const ligne = screen.getByTestId('admin-user-row-9');
    expect(within(ligne).getByText('Awa Diop')).toBeInTheDocument();
    expect(ligne.querySelector('a[href="mailto:awa@example.test"]')).not.toBeNull();
  });

  it('titre le tiroir du membre par le même nom', () => {
    const client = new QueryClient();
    render(withIntl(
      <QueryClientProvider client={client}>
        <UserDetailDrawer user={membre()} currentUserId={1} onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    ));

    expect(screen.getByRole('heading', { name: '+221 77 000 06 22' })).toBeInTheDocument();
  });

  it('nomme le membre dans la confirmation de suspension', () => {
    render(withIntl(
      <ConfirmSuspendDialog target={{ member: membre({ phone: null }), action: 'suspend' }} onCancel={vi.fn()} onConfirm={vi.fn()} />,
    ));

    expect(screen.getByText("Suspendre #42 de l'agence ?")).toBeInTheDocument();
  });
});
