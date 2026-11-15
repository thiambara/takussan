'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAgencyRoles, useAssignAgencyRole } from '@/lib/queries/agency-roles';
import type { AgencyRole, AgencyRoleAssignment } from '@/types/agency-role';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

import { useNomDuRole } from './nomDuRole';

interface MemberAgencyRoleSelectProps {
  readonly agencyId: number;
  /** L'affectation courante — le profil de ce membre DANS cette agence. */
  readonly assignment: AgencyRoleAssignment;
  /**
   * TCK-2667 — `ligne` : la rangée de la fiche du membre (maquette `app-equipe`, a, « Fiche ») —
   * libellé à gauche, sélecteur compact à droite, « Attribuer » et « Annuler » dessous une fois la
   * valeur changée. Le geste est le même : rien ne part sans le bouton.
   */
  readonly disposition?: 'bloc' | 'ligne';
  /** Le libellé de la rangée (`ligne`) ; la description du rôle choisi s'écrit dessous quand il en a une. */
  readonly libelle?: string;
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
 * ## La primitive `Select`, comme dans `CreateRoleDialog`
 *
 * La charte interdit le sélecteur natif visible ; le menu de `Select` se
 * monte dans un portail, ce qui fonctionne depuis l'intérieur d'un `Sheet`.
 */
export function MemberAgencyRoleSelect({ agencyId, assignment, disposition = 'bloc', libelle }: MemberAgencyRoleSelectProps) {
  const t = useTranslations('admin.roles');
  const tCommon = useTranslations('common.actions');
  const nomDuRole = useNomDuRole();
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

  const options: readonly AgencyRole[] = (rolesQuery.data?.data ?? []).filter((role) => role.base_profile_type === assignment.profile_type);

  const dirty = selected !== assignment.agency_role_id;

  const submit = () => {
    assign.mutate({ profile_type: assignment.profile_type, agency_role_id: selected }, { onError: () => setSelected(assignment.agency_role_id) });
  };

  const typeLabel = (): string => {
    const key = `assign.profile_types.${assignment.profile_type}`;
    return t.has(key) ? t(key) : assignment.profile_type;
  };

  const optionsSelect = options.map((role) => ({ value: String(role.id), label: nomDuRole(role) }));

  const selectId = `member-agency-role-${assignment.profile_type}-${assignment.profile_id}`;

  const erreur = assign.error ? (
    <p className="text-xs text-destructive" role="alert">
      {messageErreur(assign.error)}
    </p>
  ) : null;
  const attribuer = (
    <Button size="sm" disabled={assign.isPending} onClick={submit}>
      {assign.isPending ? <Loader2 className="mr-1 size-4 animate-spin" aria-hidden="true" /> : null}
      {assign.isPending ? t('assign.submitting') : t('assign.submit')}
    </Button>
  );

  if (disposition === 'ligne') {
    const description = options.find((role) => role.id === selected)?.description ?? null;
    return (
      <div
        className="flex min-h-[3.25rem] flex-col justify-center border-b border-border/70 px-4 py-2.5 last:border-b-0"
        data-testid={`member-agency-role-${assignment.profile_type}`}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <Label htmlFor={selectId} className="text-ui font-normal text-muted-foreground">
              {libelle ?? t('assign.label', { type: typeLabel() })}
            </Label>
            {description ? <p className="text-ui text-muted-foreground">{description}</p> : null}
          </div>
          {rolesQuery.isLoading ? (
            <p className="flex-none text-xs text-muted-foreground">{t('assign.loading')}</p>
          ) : (
            <Select
              value={String(selected)}
              disabled={assign.isPending}
              onValueChange={(next) => {
                if (next !== null) setSelected(Number(next));
              }}
              items={optionsSelect}
            >
              <SelectTrigger id={selectId} className="w-auto max-w-[60%] flex-none gap-1.5 border-border bg-card px-3 font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {optionsSelect.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {erreur ? <div className="mt-1.5">{erreur}</div> : null}
        {dirty ? (
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={assign.isPending} onClick={() => setSelected(assignment.agency_role_id)}>
              {tCommon('cancel')}
            </Button>
            {attribuer}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid={`member-agency-role-${assignment.profile_type}`}>
      <Label htmlFor={selectId}>{t('assign.label', { type: typeLabel() })}</Label>
      {rolesQuery.isLoading ? (
        <p className="text-xs text-muted-foreground">{t('assign.loading')}</p>
      ) : (
        <Select
          value={String(selected)}
          disabled={assign.isPending}
          onValueChange={(next) => {
            if (next !== null) setSelected(Number(next));
          }}
          items={optionsSelect}
        >
          <SelectTrigger id={selectId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {optionsSelect.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {erreur}

      {dirty ? attribuer : null}
    </div>
  );
}
