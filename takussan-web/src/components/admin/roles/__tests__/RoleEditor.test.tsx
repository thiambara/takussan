import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { RoleEditor } from '../RoleEditor';
import type {
  PermissionCatalogueGroup,
  RoleListItem,
} from '@/types/admin-roles';

const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock('@/hooks/useAdminRoles', () => ({
  useUpdateRoleMutation: () => ({
    mutate: mockUpdate,
    isPending: false,
    error: null,
  }),
  useDeleteRoleMutation: () => ({
    mutate: mockDelete,
    isPending: false,
    error: null,
  }),
}));

const catalogue: PermissionCatalogueGroup[] = [
  {
    resource: 'properties',
    permissions: [
      { id: 1, name: 'properties.view', action: 'view' },
      { id: 2, name: 'properties.create', action: 'create' },
    ],
  },
];

function predefined(): RoleListItem {
  return {
    id: 1,
    name: 'agent',
    guard_name: 'web',
    team_id: null,
    scope: 'global',
    is_predefined: true,
    permissions: [{ id: 1, name: 'properties.view' }],
  };
}

function custom(): RoleListItem {
  return {
    id: 2,
    name: 'comptable',
    guard_name: 'web',
    team_id: 5,
    scope: 'agency',
    is_predefined: false,
    permissions: [{ id: 1, name: 'properties.view' }],
  };
}

function renderWith(role: RoleListItem | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RoleEditor role={role} catalogue={catalogue} />
    </QueryClientProvider>,
  );
}

describe('<RoleEditor>', () => {
  beforeEach(() => {
    mockUpdate.mockReset();
    mockDelete.mockReset();
  });

  it('shows an empty state when no role is selected', () => {
    renderWith(null);
    expect(screen.getByTestId('role-editor-empty')).toBeTruthy();
  });

  it('disables checkboxes and hides save when the role is predefined', () => {
    renderWith(predefined());
    const checkbox = screen.getByTestId('permission-checkbox-properties.view') as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
    expect(screen.queryByTestId('role-editor-save')).toBeNull();
    expect(screen.queryByTestId('role-editor-delete-trigger')).toBeNull();
  });

  it('enables save when a custom role is mutated and submits the diff', () => {
    renderWith(custom());

    const saveButton = screen.getByTestId('role-editor-save') as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    fireEvent.click(screen.getByTestId('permission-checkbox-properties.create'));
    expect(saveButton.disabled).toBe(false);

    fireEvent.click(saveButton);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).toEqual({
      id: 2,
      payload: { permissions: ['properties.view', 'properties.create'] },
    });
  });

  it('opens a confirmation block before deleting a custom role', () => {
    renderWith(custom());
    fireEvent.click(screen.getByTestId('role-editor-delete-trigger'));
    expect(screen.getByTestId('role-editor-delete-confirm')).toBeTruthy();
    fireEvent.click(screen.getByTestId('role-editor-delete-confirm-button'));
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete.mock.calls[0][0]).toBe(2);
  });
});
