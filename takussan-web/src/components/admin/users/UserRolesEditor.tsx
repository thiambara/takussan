'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  const initialRole = user.roles?.[0]?.name ?? '';
  const [baselineRole, setBaselineRole] = useState<UserRole | ''>(initialRole);
  const [selected, setSelected] = useState<UserRole | ''>(initialRole);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (role: UserRole) => putUserRole(user.id, role),
    onSuccess: (_data, role) => {
      setError(null);
      setBaselineRole(role);
      queryClient.invalidateQueries({ queryKey: ['admin-users', 'list'] });
    },
    onError: (err: ApiError) => {
      setError(err.displayMessage);
      setSelected(baselineRole);
    },
  });

  const dirty = selected !== baselineRole && selected !== '';

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-app-ink-muted">
        Rôle
      </p>
      <Select
        value={selected || ''}
        onValueChange={(value) => setSelected((value ?? '') as UserRole)}
        disabled={mutation.isPending}
        items={ROLE_CHOICES as unknown as Array<{ value: string; label: string }>}
      >
        <SelectTrigger className="w-full" aria-label="Rôle de l'utilisateur">
          <SelectValue placeholder="Choisir un rôle" />
        </SelectTrigger>
        <SelectContent>
          {ROLE_CHOICES.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
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
            onClick={() => setSelected(baselineRole)}
            disabled={mutation.isPending}
          >
            Annuler
          </Button>
        ) : null}
      </div>
    </div>
  );
}
