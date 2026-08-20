'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useAgencyRoles, useAssignAgencyRole } from '@/lib/queries/agency-roles';
import type { AgencyRole, AgencyRoleAssignment } from '@/types/agency-role';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

interface MemberAgencyRoleSelectProps {
  readonly agencyId: number;
  /** L'affectation courante — le profil de ce membre DANS cette agence. */
  readonly assignment: AgencyRoleAssignment;
}

/**
 * TCK-279 (AC11) — le sélecteur de rôle d'un membre, dans la console Équipe.
 *
 * ## Filtré par `base_profile_type`, parce que l'API refuse le reste
 *
 * `AgencyRoleService::assign` rend 422 quand le rôle cible n'est pas du même
 * type que le profil. Proposer les autres serait offrir un geste dont on
 * connaît déjà l'échec.
 *
 * ## Le 422 « dernier admin » s'affiche tel quel
 *
 * Réaffecter le dernier `agency_admin` vers un rôle sans `team.assign_role`
 * est refusé avec un message dédié (AC10). Ce message est la seule chose qui
 * explique le refus : il est rendu tel que le serveur l'écrit, et le
 * sélecteur retombe sur sa valeur d'origine — laisser la nouvelle valeur
 * affichée après un refus ferait croire à un enregistrement.
 *
 * ## Un `<select>` natif, comme dans `CreateRoleDialog`
 *
 * Cohérent avec l'autre écran de ce lot, et sans portail à traverser depuis
 * l'intérieur d'un `Sheet`.
 */
export function MemberAgencyRoleSelect({ agencyId, assignment }: MemberAgencyRoleSelectProps) {
  const t = useTranslations('admin.roles');
  const messageErreur = useMessageErreurApi();
  const rolesQuery = useAgencyRoles(agencyId);
  const assign = useAssignAgencyRole(assignment.profile_id);

  const [selected, setSelected] = useState<number>(assignment.agency_role_id);

  /**
   * Après une attribution réussie, la liste des affectations est refetchée et
   * `assignment.agency_role_id` prend la nouvelle valeur — que `selected`
   * porte déjà. La resynchronisation n'a donc d'utilité que lorsqu'un TIERS a
   * changé ce rôle entre-temps ; elle vaut alors mieux qu'un formulaire qui
   * proposerait d'enregistrer une valeur déjà en base.
   */
  const [syncedRoleId, setSyncedRoleId] = useState(assignment.agency_role_id);
  if (syncedRoleId !== assignment.agency_role_id) {
    setSyncedRoleId(assignment.agency_role_id);
    setSelected(assignment.agency_role_id);
  }

  const options: readonly AgencyRole[] = (rolesQuery.data?.data ?? []).filter(
    (role) => role.base_profile_type === assignment.profile_type,
  );

  const dirty = selected !== assignment.agency_role_id;

  const submit = () => {
    assign.mutate(
      { profile_type: assignment.profile_type, agency_role_id: selected },
      { onError: () => setSelected(assignment.agency_role_id) },
    );
  };

  const typeLabel = (): string => {
    const key = `assign.profile_types.${assignment.profile_type}`;
    return t.has(key) ? t(key) : assignment.profile_type;
  };

  const selectId = `member-agency-role-${assignment.profile_type}-${assignment.profile_id}`;

  return (
    <div className="space-y-2" data-testid={`member-agency-role-${assignment.profile_type}`}>
      <Label htmlFor={selectId}>{t('assign.label', { type: typeLabel() })}</Label>
      {rolesQuery.isLoading ? (
        <p className="text-xs text-app-ink-muted">{t('assign.loading')}</p>
      ) : (
        <select
          id={selectId}
          value={selected}
          disabled={assign.isPending}
          onChange={(e) => setSelected(Number(e.target.value))}
          className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {options.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
      )}

      {assign.error ? (
        <p className="text-xs text-destructive" role="alert">
          {messageErreur(assign.error)}
        </p>
      ) : null}

      {dirty ? (
        <Button size="sm" disabled={assign.isPending} onClick={submit}>
          {assign.isPending ? (
            <Loader2 className="mr-1 size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {assign.isPending ? t('assign.submitting') : t('assign.submit')}
        </Button>
      ) : null}
    </div>
  );
}
