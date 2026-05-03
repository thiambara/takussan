'use client';

import { useMemo, useState } from 'react';
import { CreateRoleDialog } from './CreateRoleDialog';
import { RoleEditor } from './RoleEditor';
import { RolesList } from './RolesList';
import {
  usePermissionsCatalogueQuery,
  useRolesQuery,
} from '@/hooks/useAdminRoles';

interface AdminRolesClientProps {
  readonly canManage: boolean;
}

export function AdminRolesClient({ canManage }: AdminRolesClientProps) {
  const rolesQuery = useRolesQuery();
  const catalogueQuery = usePermissionsCatalogueQuery();
  // `null` means "use the default" — concrete user clicks set it to the
  // chosen role's id. Derived selection below reconciles user intent with
  // the latest server data, so a deletion doesn't strand us on a missing id.
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const roles = useMemo(() => rolesQuery.data?.data ?? [], [rolesQuery.data]);

  const effectiveSelectedId = useMemo(() => {
    if (selectedId !== null && roles.some((r) => r.id === selectedId)) {
      return selectedId;
    }
    if (roles.length === 0) return null;
    const firstCustom = roles.find((r) => !r.is_predefined);
    return (firstCustom ?? roles[0]).id;
  }, [roles, selectedId]);

  const selected = useMemo(
    () => roles.find((r) => r.id === effectiveSelectedId) ?? null,
    [roles, effectiveSelectedId],
  );

  if (!canManage) {
    return (
      <div
        className="rounded-md border border-input bg-app-surface-1 p-6 text-sm text-app-ink-muted"
        role="status"
        data-testid="admin-roles-forbidden"
      >
        Vous n’avez pas la permission de gérer les rôles. Contactez l’admin
        de votre agence.
      </div>
    );
  }

  if (rolesQuery.isLoading || catalogueQuery.isLoading) {
    return (
      <div
        className="grid gap-6 md:grid-cols-[280px_1fr]"
        data-testid="admin-roles-loading"
      >
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-10 animate-pulse rounded-md bg-app-surface-2"
              aria-hidden="true"
            />
          ))}
        </div>
        <div className="space-y-3">
          <div className="h-8 w-1/3 animate-pulse rounded-md bg-app-surface-2" aria-hidden="true" />
          <div className="h-48 animate-pulse rounded-md bg-app-surface-2" aria-hidden="true" />
        </div>
      </div>
    );
  }

  if (rolesQuery.isError || catalogueQuery.isError) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
        Erreur de chargement.{' '}
        {(rolesQuery.error ?? catalogueQuery.error)?.displayMessage}
      </div>
    );
  }

  const catalogue = catalogueQuery.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <CreateRoleDialog
          catalogue={catalogue}
          onCreated={(role) => setSelectedId(role.id)}
        />
      </div>
      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <RolesList
          roles={roles}
          selectedId={effectiveSelectedId}
          onSelect={(role) => setSelectedId(role.id)}
        />
        <RoleEditor
          // Force remount on role change so the editor's local edit state
          // resets without reading prevProps in an effect.
          key={selected?.id ?? 'empty'}
          role={selected}
          catalogue={catalogue}
          onDeleted={() => setSelectedId(null)}
        />
      </div>
    </div>
  );
}
