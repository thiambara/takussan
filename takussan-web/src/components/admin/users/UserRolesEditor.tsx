'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { putUserRole } from '@/lib/queries/admin-users';
import type { AdminAgencyUserRow } from '@/types/admin-users';
import type { UserRole } from '@/types/user';
import { ApiError } from '@/lib/api';

const ROLE_CHOICES: { value: UserRole; label: string }[] = [
  { value: 'agency_admin', label: 'Administrateur' },
  { value: 'agent', label: 'Agent' },
  { value: 'owner', label: 'Bailleur' },
  { value: 'tenant', label: 'Locataire' },
  { value: 'customer', label: 'Client' },
  { value: 'service_provider', label: 'Prestataire' },
];

interface UserRolesEditorProps {
  user: AdminAgencyUserRow;
}

/**
 * TCK-133 — single-role editor used inside `UserDetailDrawer`. Backed by
 * `PUT /api/users/{user}/role` (TCK-014, syncRoles). No additive
 * `assign role` flow on this page — a user holds exactly one effective
 * role per agency context (see CLAUDE.md role model).
 */
export function UserRolesEditor({ user }: UserRolesEditorProps) {
  const queryClient = useQueryClient();
  const currentRole = user.roles?.[0]?.name ?? '';
  const [selected, setSelected] = useState<UserRole | ''>(currentRole);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (role: UserRole) => putUserRole(user.id, role),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['admin-users', 'list'] });
    },
    onError: (err: ApiError) => {
      setError(err.displayMessage);
      setSelected(currentRole);
    },
  });

  const dirty = selected !== currentRole && selected !== '';

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-app-ink-muted">
        Rôle
      </p>
      <select
        aria-label="Rôle de l'utilisateur"
        value={selected}
        onChange={(e) => setSelected(e.target.value as UserRole)}
        disabled={mutation.isPending}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-app-ink"
      >
        <option value="" disabled>
          Choisir un rôle
        </option>
        {ROLE_CHOICES.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={!dirty || mutation.isPending}
          onClick={() => selected && mutation.mutate(selected)}
        >
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          Mettre à jour
        </Button>
        {dirty ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(currentRole)}
            disabled={mutation.isPending}
          >
            Annuler
          </Button>
        ) : null}
      </div>
    </div>
  );
}
