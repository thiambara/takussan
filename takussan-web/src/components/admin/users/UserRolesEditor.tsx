'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
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
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

/**
 * TCK-278 — seuls les rôles qui matérialisent réellement un profil
 * agence-scopé sont proposés.
 *
 * `tenant`, `customer` et `service_provider` ont été retirés : le backend les
 * accepte en validation puis retombe sur `default => null` dans
 * `UserRoleController::mutateProfileForRole()`. L'API répond 200, l'écran
 * affiche un succès, et **aucune mutation n'a lieu** — un no-op silencieux est
 * pire qu'un refus, parce que l'opérateur croit avoir agi.
 *
 * Ces trois qualités s'obtiennent par leurs flux dédiés : invitation
 * prestataire, booking, bail.
 */
export const ROLE_CHOICES: { value: UserRole }[] = [
  { value: 'agency_admin' },
  { value: 'agent' },
  { value: 'owner' },
];

interface UserRolesEditorProps {
  user: AdminAgencyUserRow;
}

/**
 * TCK-133 — single-role editor used inside `UserDetailDrawer`. Backed by
 * `PUT /api/users/{user}/role`.
 *
 * TCK-278 — the endpoint no longer syncs spatie roles (the package is
 * uninstalled): it creates/archives the matching polymorphic profile in a
 * transaction, wiping the competing agency-scoped profiles. The wording
 * "one effective role per agency context" still holds — it is now an
 * invariant of the profile mutation, not of a role table.
 */
export function UserRolesEditor({ user }: UserRolesEditorProps) {
  const t = useTranslations('admin.users');
  const tCommon = useTranslations('common.actions');
  const messageErreur = useMessageErreurApi();
  // TCK-292 — la donnée porte la clé (`ROLE_CHOICES` ne transporte plus que la
  // valeur d'API), le rendu la résout sous `admin.users.roles.*`.
  const roleOptions = ROLE_CHOICES.map((c) => ({ value: c.value, label: t(`roles.${c.value}`) }));
  const queryClient = useQueryClient();
  // TCK-278 — `roles[0]` peut être une string (UserResource) ou `{name}`
  // (UserDetailResource). Normalise pour récupérer le rôle.
  const firstRole = user.roles?.[0];
  const initialRole = (typeof firstRole === 'string' ? firstRole : firstRole?.name) ?? '';
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
      setError(messageErreur(err));
      setSelected(baselineRole);
    },
  });

  const dirty = selected !== baselineRole && selected !== '';

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-app-ink-muted">
        {t('rolesEditor.heading')}
      </p>
      <Select
        value={selected || ''}
        onValueChange={(value) => setSelected((value ?? '') as UserRole)}
        disabled={mutation.isPending}
        items={roleOptions}
      >
        <SelectTrigger className="w-full" aria-label={t('rolesEditor.selectAria')}>
          <SelectValue placeholder={t('rolesEditor.placeholder')} />
        </SelectTrigger>
        <SelectContent>
          {roleOptions.map((opt) => (
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
          {t('rolesEditor.update')}
        </Button>
        {dirty ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(baselineRole)}
            disabled={mutation.isPending}
          >
            {tCommon('cancel')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
