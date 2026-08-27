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
import type { ApiError } from '@/lib/api';
import { useRevokeRoleDelegation } from '@/lib/queries/role-delegations';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useFormatDate } from '@/i18n/hooks';
import type { RoleDelegation } from '@/types/role-delegation';

interface RevokeDelegationDialogProps {
  readonly agencyId: number;
  /** `null` ferme le dialogue — même convention que `DeleteRoleDialog`. */
  readonly delegation: RoleDelegation | null;
  readonly onClose: () => void;
}

/**
 * TCK-369 — révocation d'une délégation, avec confirmation.
 *
 * ## Pourquoi une confirmation pour un geste réversible en apparence
 *
 * Il ne l'est pas : `RoleDelegationService::revoke` ne rend pas la délégation
 * à son état antérieur, il la ferme (`revoked`, `revoked_at`, `revoked_by`).
 * Reprendre la délégation demande d'en créer une nouvelle — et l'AC4 de
 * TCK-108 pose que l'effet est **immédiat, dans la requête courante** : le
 * bénéficiaire perd ses droits pendant qu'il travaille.
 *
 * ## Le DELETE n'efface pas, et le dialogue ne le prétend pas
 *
 * La réponse est un 200 portant la délégation passée à `revoked`, pas un 204.
 * La ligne reste donc à l'écran, en statut révoqué — c'est la trace d'audit
 * (`revoked_by`) que le backend garde délibérément. Le libellé parle de
 * « révoquer », jamais de « supprimer ».
 */
export function RevokeDelegationDialog({
  agencyId,
  delegation,
  onClose,
}: RevokeDelegationDialogProps) {
  const t = useTranslations('admin.roles.role_delegations');
  const tCommon = useTranslations('common.actions');
  const messageErreur = useMessageErreurApi();
  const formatDate = useFormatDate();
  const revoke = useRevokeRoleDelegation(agencyId);

  /**
   * Lu depuis le callback et non depuis `revoke.error` : les deux branches
   * dérivent alors de la même valeur au même instant. Même raison que
   * `DeleteRoleDialog`.
   */
  const [echec, setEchec] = useState<ApiError | null>(null);

  /**
   * Ouvrir le dialogue sur une AUTRE délégation doit repartir vierge, sans
   * quoi l'échec de la précédente resterait affiché sous le nouveau nom.
   */
  const [synchroniseSur, setSynchroniseSur] = useState<number | null>(delegation?.id ?? null);
  if (synchroniseSur !== (delegation?.id ?? null)) {
    setSynchroniseSur(delegation?.id ?? null);
    setEchec(null);
    revoke.reset();
  }

  const nom = delegation?.user
    ? `${delegation.user.first_name} ${delegation.user.last_name}`.trim()
    : t('unknown_member', { id: delegation?.user_id ?? 0 });

  const submit = () => {
    if (delegation === null) return;
    revoke.mutate(delegation.id, {
      onSuccess: () => onClose(),
      onError: (err) => setEchec(err),
    });
  };

  return (
    <Dialog open={delegation !== null} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('revoke.title')}</DialogTitle>
          <DialogDescription>
            {t('revoke.description', {
              name: nom,
              end: delegation ? formatDate(delegation.ends_at) : '',
            })}
          </DialogDescription>
        </DialogHeader>

        {echec ? (
          <p className="text-sm text-destructive" role="alert">
            {messageErreur(echec, t('errors.revoke'))}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={revoke.isPending}>
            {tCommon('cancel')}
          </Button>
          <Button variant="destructive" onClick={submit} disabled={revoke.isPending}>
            {revoke.isPending ? (
              <Loader2 className="mr-1 size-4 animate-spin" aria-hidden="true" />
            ) : null}
            {revoke.isPending ? t('revoke.submitting') : t('revoke.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
