'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { putUserRole } from '@/lib/queries/admin-users';
import type { AdminAgencyUserRow } from '@/types/admin-users';
import type { UserRole } from '@/types/user';
import { ApiError } from '@/lib/api';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
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
export const ROLE_CHOICES: { value: UserRole }[] = [{ value: 'agency_admin' }, { value: 'agent' }, { value: 'owner' }];

interface UserRolesEditorProps {
  user: AdminAgencyUserRow;
  /**
   * TCK-2667 — le profil en place quand la ligne ne porte pas `roles` (la liste de l'équipe ne les
   * demande pas : elle lit les profils). Sans lui, le sélecteur s'ouvrait sur « Choisir un rôle »
   * pour un agent actif.
   */
  roleCourant?: UserRole;
  /** TCK-2667 — `ligne` : la rangée de la fiche du membre, libellé à gauche, sélecteur compact à droite. */
  disposition?: 'bloc' | 'ligne';
  /** Les textes de la rangée (`ligne`), que la fiche fournit. */
  ligne?: { libelle: string; detail?: string };
}

/**
 * TCK-133 — single-role editor, inside the member fiche (`FicheDuMembre`, TCK-2667). Backed by
 * `PUT /api/users/{user}/role`.
 *
 * TCK-278 — the endpoint no longer syncs spatie roles (the package is
 * uninstalled): it creates/archives the matching polymorphic profile in a
 * transaction, wiping the competing agency-scoped profiles. The wording
 * "one effective role per agency context" still holds — it is now an
 * invariant of the profile mutation, not of a role table.
 */
export function UserRolesEditor({ user, roleCourant, disposition = 'bloc', ligne }: UserRolesEditorProps) {
  const t = useTranslations('admin.users');
  const tCommon = useTranslations('common.actions');
  const messageErreur = useMessageErreurApi();
  // TCK-292 — la donnée porte la clé (`ROLE_CHOICES` ne transporte plus que la
  // valeur d'API), le rendu la résout sous `admin.users.roles.*`.
  const roleOptions = ROLE_CHOICES.map((c) => ({ value: c.value, label: t(`roles.${c.value}`) }));
  const queryClient = useQueryClient();
  // TCK-1203 — changer un rôle exige la 2FA de l'agence (`UserRoleController@update`).
  const garde = useGardeDoubleFacteur();
  // TCK-278 — `roles[0]` peut être une string (UserResource) ou `{name}`
  // (UserDetailResource). Normalise pour récupérer le rôle.
  const firstRole = user.roles?.[0];
  const initialRole = (typeof firstRole === 'string' ? firstRole : firstRole?.name) ?? roleCourant ?? '';
  const [baselineRole, setBaselineRole] = useState<UserRole | ''>(initialRole);
  const [selected, setSelected] = useState<UserRole | ''>(initialRole);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (role: UserRole) => avecGardeDoubleFacteur(() => putUserRole(user.id, role), garde),
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

  if (disposition === 'ligne' && ligne) {
    const selectId = `user-role-${user.id}`;
    return (
      <div className="flex min-h-[3.25rem] flex-col justify-center border-b border-border/70 px-4 py-2.5 last:border-b-0">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor={selectId} className="block text-ui text-muted-foreground">
              {ligne.libelle}
            </label>
            {ligne.detail ? <p className="text-ui text-muted-foreground">{ligne.detail}</p> : null}
          </div>
          <Select
            value={selected || ''}
            onValueChange={(value) => setSelected((value ?? '') as UserRole)}
            disabled={mutation.isPending}
            items={roleOptions}
          >
            <SelectTrigger id={selectId} className="w-auto max-w-[60%] flex-none gap-1.5 border-border bg-card px-3 font-medium">
              <SelectValue placeholder={t('rolesEditor.placeholder')} />
            </SelectTrigger>
            <SelectContent align="end">
              {roleOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {error ? (
          <p className="mt-1.5 text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {dirty ? (
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(baselineRole)} disabled={mutation.isPending}>
              {tCommon('cancel')}
            </Button>
            <Button size="sm" disabled={mutation.isPending} onClick={() => selected && mutation.mutate(selected)}>
              {mutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {t('rolesEditor.update')}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('rolesEditor.heading')}</p>
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
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!dirty || mutation.isPending} onClick={() => selected && mutation.mutate(selected)}>
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {t('rolesEditor.update')}
        </Button>
        {dirty ? (
          <Button size="sm" variant="ghost" onClick={() => setSelected(baselineRole)} disabled={mutation.isPending}>
            {tCommon('cancel')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
