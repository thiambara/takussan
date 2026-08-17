import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { AgencyRolesList } from '../AgencyRolesList';
import type { AgencyRole } from '@/types/agency-role';

function role(over: Partial<AgencyRole> & Pick<AgencyRole, 'id' | 'name'>): AgencyRole {
  return {
    agency_id: 1,
    base_profile_type: 'agent',
    description: null,
    is_system: false,
    is_clonable: true,
    capabilities: [],
    profiles_count: 0,
    ...over,
  };
}

const ROLES: AgencyRole[] = [
  role({ id: 1, name: 'Agent', is_system: true, capabilities: ['properties.publish'], profiles_count: 3 }),
  role({ id: 2, name: 'Agent senior' }),
  role({ id: 3, name: 'Administrateur', base_profile_type: 'agency_admin', is_system: true }),
];

function renderList(props: Partial<Parameters<typeof AgencyRolesList>[0]> = {}) {
  const handlers = { onSelect: vi.fn(), onClone: vi.fn(), onDelete: vi.fn() };
  render(
    withIntl(
      <AgencyRolesList
        roles={ROLES}
        selectedId={null}
        canCreate
        canDelete
        {...handlers}
        {...props}
      />,
    ),
  );
  return handlers;
}

describe('<AgencyRolesList>', () => {
  it('groupe par type de profil, administrateurs en tête', () => {
    renderList();

    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    // Ordre FIGÉ, pas celui de la réponse : l'API trie par `name`, donc
    // dériver l'ordre des groupes de la réponse le ferait dépendre des noms
    // que l'agence a choisis.
    expect(headings).toEqual(['Administrateurs', 'Agents']);
  });

  it("n'offre pas « Supprimer » sur un rôle système", () => {
    renderList();

    const systemCard = screen.getByRole('button', { name: 'Sélectionner le rôle Agent' })
      .parentElement!;
    // La policy sort sur `is_system` AVANT de regarder la capacité : le
    // bouton n'aurait aucun utilisateur pour qui il aboutirait.
    expect(within(systemCard).queryByRole('button', { name: /Supprimer/ })).toBeNull();
    expect(within(systemCard).getByRole('button', { name: /Cloner/ })).toBeInTheDocument();
  });

  it('offre « Supprimer » sur un rôle personnalisé', () => {
    renderList();

    const customCard = screen.getByRole('button', { name: 'Sélectionner le rôle Agent senior' })
      .parentElement!;
    expect(within(customCard).getByRole('button', { name: /Supprimer/ })).toBeInTheDocument();
  });

  it('masque « Cloner » sans roles.create_custom et « Supprimer » sans roles.delete_custom', () => {
    renderList({ canCreate: false, canDelete: false });

    expect(screen.queryByRole('button', { name: /Cloner/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Supprimer/ })).toBeNull();
  });

  it('affiche le badge système et les deux compteurs', () => {
    renderList();

    const systemCard = screen.getByRole('button', { name: 'Sélectionner le rôle Agent' });
    expect(within(systemCard).getByText('Système')).toBeInTheDocument();
    expect(systemCard).toHaveTextContent('1 capacité');
    expect(systemCard).toHaveTextContent('3 membres');
  });

  it('remonte la sélection, le clone et la suppression', async () => {
    const user = userEvent.setup();
    const handlers = renderList();

    await user.click(screen.getByRole('button', { name: 'Sélectionner le rôle Agent senior' }));
    expect(handlers.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));

    const customCard = screen.getByRole('button', { name: 'Sélectionner le rôle Agent senior' })
      .parentElement!;
    await user.click(within(customCard).getByRole('button', { name: /Cloner/ }));
    expect(handlers.onClone).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));

    await user.click(within(customCard).getByRole('button', { name: /Supprimer/ }));
    expect(handlers.onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
  });

  it('marque le rôle courant avec aria-current', () => {
    renderList({ selectedId: 2 });

    expect(
      screen.getByRole('button', { name: 'Sélectionner le rôle Agent senior' }),
    ).toHaveAttribute('aria-current', 'true');
    expect(
      screen.getByRole('button', { name: 'Sélectionner le rôle Agent' }),
    ).not.toHaveAttribute('aria-current');
  });
});
