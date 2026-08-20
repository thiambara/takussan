'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, ShieldCheck } from 'lucide-react';

import { EmptyState, ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { AgencyRoleEditor } from './AgencyRoleEditor';
import { AgencyRolesList } from './AgencyRolesList';
import { CreateRoleDialog } from './CreateRoleDialog';
import { DeleteRoleDialog } from './DeleteRoleDialog';
import { useAgencyRoles } from '@/lib/queries/agency-roles';
import { useCanAll } from '@/hooks/useCan';
import type { AgencyRole } from '@/types/agency-role';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

/**
 * Références figées hors composant : `useCanAll` mémoïse sur la RÉFÉRENCE du
 * tableau, un littéral inline en recréerait une à chaque rendu.
 */
const CAP_CREATE = ['roles.create_custom'] as const;
const CAP_EDIT = ['roles.edit_custom'] as const;
const CAP_DELETE = ['roles.delete_custom'] as const;

interface AgencyRolesConsoleProps {
  readonly agencyId: number;
}

/**
 * TCK-279 (AC11) — écran `/admin/roles` : la liste à gauche, l'éditeur à
 * droite.
 *
 * ## Les gestes sont gardés par CAPACITÉ, pas par type de profil (AC12)
 *
 * `roles.create_custom`, `roles.edit_custom` et `roles.delete_custom` sont
 * trois cas distincts du catalogue, et un rôle personnalisé peut n'en porter
 * qu'un. Un `isAgencyAdmin(user.roles)` unique aurait affiché les trois
 * boutons à un administrateur qui n'a que le premier — trois 403 à découvrir
 * au clic.
 *
 * ⚠️ `useCan` **n'autorise rien** : les policies décident. Cacher un bouton
 * évite d'offrir un geste qui échouera, ce n'est pas une garde.
 *
 * Le `useCanAll` groupé fait UNE requête pour les trois verdicts, là où trois
 * `useCan` en feraient trois — même clé de cache, mais trois abonnements
 * distincts au montage.
 */
export function AgencyRolesConsole({ agencyId }: AgencyRolesConsoleProps) {
  const t = useTranslations('admin.roles');
  const tCommon = useTranslations('common.actions');
  const messageErreur = useMessageErreurApi();
  const rolesQuery = useAgencyRoles(agencyId);

  const { can: canCreate } = useCanAll(CAP_CREATE, { agencyId });
  const { can: canEdit } = useCanAll(CAP_EDIT, { agencyId });
  const { can: canDelete } = useCanAll(CAP_DELETE, { agencyId });

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [cloneSource, setCloneSource] = useState<AgencyRole | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AgencyRole | null>(null);

  const roles = useMemo(() => rolesQuery.data?.data ?? [], [rolesQuery.data]);

  /**
   * La sélection vit par ID, pas par objet : après une mutation la liste est
   * refetchée et l'ancien objet devient orphelin.
   *
   * Le repli sur le premier rôle est CALCULÉ, pas posé par un effet. Un
   * `useEffect(() => setSelectedId(roles[0].id))` peindrait d'abord un écran
   * sans sélection, puis le corrigerait — un scintillement à chaque
   * chargement, et un état à tenir synchronisé pour rien.
   */
  const selected = useMemo(
    () => roles.find((r) => r.id === selectedId) ?? roles[0] ?? null,
    [roles, selectedId],
  );

  if (rolesQuery.isLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]" data-testid="agency-roles-loading">
        <div className="h-64 animate-pulse rounded-xl bg-muted" aria-hidden="true" />
        <div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden="true" />
      </div>
    );
  }

  if (rolesQuery.isError) {
    return (
      <ErrorState
        message={messageErreur(rolesQuery.error, t('errors.load'))}
        onRetry={() => void rolesQuery.refetch()}
        retryLabel={tCommon('retry')}
      />
    );
  }

  return (
    <div className="space-y-4">
      {canCreate ? (
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => {
              setCloneSource(null);
              setCreateOpen(true);
            }}
          >
            <Plus className="mr-1 size-4" aria-hidden="true" />
            {t('actions.create')}
          </Button>
        </div>
      ) : null}

      {roles.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="size-8" aria-hidden="true" />}
          title={t('editor.empty_title')}
          description={t('editor.empty_description')}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <AgencyRolesList
            roles={roles}
            selectedId={selected?.id ?? null}
            canCreate={canCreate}
            canDelete={canDelete}
            onSelect={(role) => setSelectedId(role.id)}
            onClone={(role) => {
              setCloneSource(role);
              setCreateOpen(true);
            }}
            onDelete={(role) => setPendingDelete(role)}
          />

          {selected ? (
            <AgencyRoleEditor
              key={selected.id}
              agencyId={agencyId}
              role={selected}
              canEdit={canEdit}
            />
          ) : (
            <EmptyState
              icon={<ShieldCheck className="size-8" aria-hidden="true" />}
              title={t('editor.empty_title')}
              description={t('editor.empty_description')}
            />
          )}
        </div>
      )}

      <CreateRoleDialog
        agencyId={agencyId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        roles={roles}
        cloneFrom={cloneSource}
        onCreated={(role) => setSelectedId(role.id)}
      />

      <DeleteRoleDialog
        agencyId={agencyId}
        role={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onDeleted={(role) => {
          setPendingDelete(null);
          if (role.id === selectedId) setSelectedId(null);
        }}
      />
    </div>
  );
}
