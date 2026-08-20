'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDeleteAgencyRole } from '@/lib/queries/agency-roles';
import type { ApiError } from '@/lib/api';
import type { AgencyRole, BlockingProfile } from '@/types/agency-role';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

interface DeleteRoleDialogProps {
  readonly agencyId: number;
  readonly role: AgencyRole | null;
  readonly onCancel: () => void;
  readonly onDeleted: (role: AgencyRole) => void;
}

/** Le corps du 409 (`{message, profiles}`), quand la réponse en porte un. */
function readConflict(data: unknown): readonly BlockingProfile[] | null {
  if (typeof data !== 'object' || data === null) return null;
  const profiles = (data as { profiles?: unknown }).profiles;
  return Array.isArray(profiles) ? (profiles as BlockingProfile[]) : null;
}

/**
 * TCK-279 (AC5) — suppression d'un rôle, et son refus motivé.
 *
 * ## Le 409 n'est pas une erreur, c'est une réponse
 *
 * `DELETE .../roles/{r}` rend **409 avec la liste des profils en cause**
 * quand le rôle est encore porté. L'afficher comme un bandeau rouge
 * générique perdrait la seule information utile : QUI bloque. Le dialogue
 * reste donc ouvert et se transforme en liste nominative — c'est ce qui
 * permet d'aller réaffecter ces membres.
 *
 * `profiles_count` grise déjà le bouton en amont, mais ne le remplace pas :
 * ce compte date de la dernière lecture de la liste, et un autre
 * administrateur peut avoir attribué le rôle entre-temps.
 */
export function DeleteRoleDialog({
  agencyId,
  role,
  onCancel,
  onDeleted,
}: DeleteRoleDialogProps) {
  const t = useTranslations('admin.roles');
  const tCommon = useTranslations('common.actions');
  const messageErreur = useMessageErreurApi();
  const remove = useDeleteAgencyRole(agencyId);
  /**
   * Le refus est lu depuis l'objet d'erreur du callback, PAS depuis
   * `remove.error`. Les deux branches — conflit 409 et panne ordinaire —
   * dérivent alors de la même valeur, au même instant : impossible d'afficher
   * la liste de conflit d'un appel et le message d'un autre.
   */
  const [failure, setFailure] = useState<ApiError | null>(null);
  const blocking: readonly BlockingProfile[] | null =
    failure?.status === 409 ? (readConflict(failure.data) ?? []) : null;

  /**
   * Ouvrir le dialogue sur un AUTRE rôle doit repartir d'un état vierge :
   * sans cela, la liste de conflit du rôle précédent resterait affichée sous
   * le titre du nouveau. Ajusté pendant le rendu — un effet laisserait ce
   * mensonge à l'écran le temps d'une peinture.
   */
  const [syncedRoleId, setSyncedRoleId] = useState<number | null>(role?.id ?? null);
  if (syncedRoleId !== (role?.id ?? null)) {
    setSyncedRoleId(role?.id ?? null);
    setFailure(null);
    remove.reset();
  }

  const submit = () => {
    if (role === null) return;
    remove.mutate(role.id, {
      onSuccess: () => onDeleted(role),
      onError: (err) => setFailure(err),
    });
  };

  return (
    <Dialog open={role !== null} onOpenChange={(next) => (!next ? onCancel() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {blocking ? t('remove.conflict_title') : t('remove.title')}
          </DialogTitle>
          <DialogDescription>
            {blocking
              ? t('remove.conflict_description')
              : t('remove.description', { name: role?.name ?? '' })}
          </DialogDescription>
        </DialogHeader>

        {blocking ? (
          <ul className="max-h-56 space-y-1 overflow-y-auto text-sm" data-testid="delete-role-conflict">
            {blocking.map((profile) => (
              <li
                key={`${profile.type}-${profile.id}`}
                className="rounded-md bg-app-surface-2/60 px-3 py-1.5 text-app-ink"
              >
                {profile.display_name ?? t('remove.conflict_unnamed', { id: profile.id })}
              </li>
            ))}
          </ul>
        ) : null}

        {failure && !blocking ? (
          <p className="text-sm text-destructive" role="alert">
            {messageErreur(failure)}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={remove.isPending}>
            {tCommon('cancel')}
          </Button>
          {blocking ? null : (
            <Button variant="destructive" onClick={submit} disabled={remove.isPending}>
              {remove.isPending ? (
                <Loader2 className="mr-1 size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {remove.isPending ? t('remove.submitting') : t('remove.submit')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
