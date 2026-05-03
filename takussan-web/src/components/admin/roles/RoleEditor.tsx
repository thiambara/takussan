'use client';

import { useMemo, useState } from 'react';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PermissionMatrix } from './PermissionMatrix';
import {
  useDeleteRoleMutation,
  useUpdateRoleMutation,
} from '@/hooks/useAdminRoles';
import type {
  PermissionCatalogueGroup,
  RoleListItem,
} from '@/types/admin-roles';

interface RoleEditorProps {
  readonly role: RoleListItem | null;
  readonly catalogue: readonly PermissionCatalogueGroup[];
  readonly onDeleted?: () => void;
}

function permissionSet(role: RoleListItem | null): Set<string> {
  return new Set((role?.permissions ?? []).map((p) => p.name));
}

// Parent (`AdminRolesClient`) remounts this component via `key={role.id}`
// when the selected role changes, so local edit state resets naturally
// without an effect.
export function RoleEditor({ role, catalogue, onDeleted }: RoleEditorProps) {
  const initial = useMemo(() => permissionSet(role), [role]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const updateMutation = useUpdateRoleMutation();
  const deleteMutation = useDeleteRoleMutation();

  if (!role) {
    return (
      <div
        className="flex h-full min-h-[200px] items-center justify-center rounded-md border border-dashed border-input p-6 text-sm text-app-ink-muted"
        data-testid="role-editor-empty"
      >
        Sélectionnez un rôle dans la liste pour consulter ou éditer ses
        permissions.
      </div>
    );
  }

  const readOnly = role.is_predefined;
  const dirty =
    !readOnly &&
    (initial.size !== selected.size ||
      Array.from(selected).some((p) => !initial.has(p)));

  const handleToggle = (perm: string, next: boolean) => {
    setSelected((prev) => {
      const out = new Set(prev);
      if (next) out.add(perm);
      else out.delete(perm);
      return out;
    });
  };

  const handleSave = () => {
    updateMutation.mutate({
      id: role.id,
      payload: { permissions: Array.from(selected) },
    });
  };

  const handleDelete = () => {
    deleteMutation.mutate(role.id, {
      onSuccess: () => onDeleted?.(),
    });
  };

  const updateError = updateMutation.error;
  const deleteError = deleteMutation.error;

  return (
    <div className="flex h-full flex-col gap-4" data-testid="role-editor">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-app-ink">{role.name}</h2>
          <p className="mt-0.5 text-xs text-app-ink-muted">
            {readOnly
              ? 'Rôle prédéfini — lecture seule.'
              : 'Rôle personnalisé scopé à votre agence.'}
          </p>
        </div>
        {!readOnly ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              disabled={deleteMutation.isPending || updateMutation.isPending}
              data-testid="role-editor-delete-trigger"
            >
              <Trash2 aria-hidden="true" className="mr-1 h-4 w-4" /> Supprimer
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={!dirty || updateMutation.isPending}
              data-testid="role-editor-save"
            >
              {updateMutation.isPending ? (
                <Loader2 aria-hidden="true" className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Save aria-hidden="true" className="mr-1 h-4 w-4" />
              )}
              Enregistrer
            </Button>
          </div>
        ) : null}
      </header>

      {updateError ? (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {updateError.displayMessage}
        </div>
      ) : null}

      {deleteError ? (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
          data-testid="role-editor-delete-error"
        >
          {deleteError.displayMessage}
        </div>
      ) : null}

      {confirmDelete ? (
        <div
          className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
          data-testid="role-editor-delete-confirm"
        >
          <p className="font-medium text-destructive">
            Confirmer la suppression de « {role.name} » ?
          </p>
          <p className="mt-1 text-app-ink-muted">
            Cette action est définitive. Le rôle ne peut être supprimé que
            s’il n’est plus attribué à aucun utilisateur.
          </p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmDelete(false)}
              disabled={deleteMutation.isPending}
            >
              Annuler
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              data-testid="role-editor-delete-confirm-button"
            >
              {deleteMutation.isPending ? (
                <Loader2 aria-hidden="true" className="mr-1 h-4 w-4 animate-spin" />
              ) : null}
              Supprimer définitivement
            </Button>
          </div>
        </div>
      ) : null}

      <PermissionMatrix
        catalogue={catalogue}
        selected={selected}
        initial={initial}
        readOnly={readOnly}
        onToggle={handleToggle}
      />
    </div>
  );
}
