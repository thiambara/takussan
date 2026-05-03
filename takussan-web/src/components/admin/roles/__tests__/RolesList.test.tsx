import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { RolesList } from '../RolesList';
import type { RoleListItem } from '@/types/admin-roles';

function role(partial: Partial<RoleListItem>): RoleListItem {
  return {
    id: partial.id ?? 1,
    name: partial.name ?? 'agency_admin',
    guard_name: 'web',
    team_id: partial.team_id ?? null,
    scope: partial.team_id ? 'agency' : 'global',
    is_predefined: partial.team_id === null || partial.team_id === undefined,
    permissions: partial.permissions ?? [],
  };
}

describe('<RolesList>', () => {
  it('renders predefined and custom sections separately', () => {
    const roles: RoleListItem[] = [
      role({ id: 1, name: 'agency_admin' }),
      role({ id: 2, name: 'comptable', team_id: 5 }),
    ];

    render(<RolesList roles={roles} selectedId={null} onSelect={() => {}} />);

    expect(screen.getByTestId('roles-list-predefined')).toBeTruthy();
    expect(screen.getByTestId('roles-list-custom')).toBeTruthy();
    expect(screen.getByTestId('role-row-agency_admin')).toBeTruthy();
    expect(screen.getByTestId('role-row-comptable')).toBeTruthy();
  });

  it('marks predefined rows as read-only and custom rows as editable', () => {
    const roles: RoleListItem[] = [
      role({ id: 1, name: 'agent' }),
      role({ id: 2, name: 'comptable', team_id: 5 }),
    ];
    render(<RolesList roles={roles} selectedId={null} onSelect={() => {}} />);
    expect(
      screen.getByTestId('role-row-agent').textContent,
    ).toContain('Lecture seule');
    expect(
      screen.getByTestId('role-row-comptable').textContent,
    ).not.toContain('Lecture seule');
  });

  it('invokes onSelect with the clicked role', () => {
    const onSelect = vi.fn();
    const roles: RoleListItem[] = [role({ id: 7, name: 'comptable', team_id: 5 })];
    render(<RolesList roles={roles} selectedId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('role-row-comptable'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(roles[0]);
  });

  it('shows empty state when there are no custom roles', () => {
    const roles: RoleListItem[] = [role({ id: 1, name: 'agent' })];
    render(<RolesList roles={roles} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText(/Aucun rôle personnalisé/)).toBeTruthy();
  });
});
