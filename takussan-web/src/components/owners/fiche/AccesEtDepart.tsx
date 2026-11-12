'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { ConfirmSuspendDialog } from '@/components/admin/ConfirmSuspendDialog';
import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import type { OwnerProfileDetail } from '@/lib/queries/owners';
import { postTeamSuspension, type TeamSuspensionAction } from '@/lib/queries/team-suspension';

/**
 * TCK-2641 — « Accès et départ », en bas de la fiche : les gestes que la page Équipe portait pour un
 * bailleur (TCK-587, ADR-0031 § 2), pour que TCK-2667 puisse les y retirer sans régression.
 *
 *  · « Suspendre l'accès » : `POST /api/agencies/{agency}/team/{user}/suspend`. Le profil bailleur
 *    passe `blocked` DANS l'agence ; le compte ne bouge pas. « Réactiver » le rétablit.
 *  · Mêmes gardes que l'Équipe : confirmation qui dit l'effet avant d'agir (`ConfirmSuspendDialog`),
 *    double authentification de l'agence (TCK-1203, `avecGardeDoubleFacteur`).
 *
 * « Retirer de l'agence » n'est PAS ici : l'API refuse de retirer un bailleur qui n'est pas du
 * personnel (`agency_member.not_staff`), et la page Équipe ne le proposait pas. Ce que ce départ
 * voudrait dire (biens, baux, argent) attend sa décision : TCK-2753.
 *
 * Un brouillon d'invitation n'a pas de compte : rien à suspendre, la section ne s'affiche pas.
 */
interface Props {
  readonly owner: OwnerProfileDetail;
  readonly agencyId: number;
}

export function AccesEtDepart({ owner, agencyId }: Props) {
  const t = useTranslations('owners.fiche.acces');
  const tErr = useTranslations('errors');
  const toast = useToast();
  const messageErreur = useMessageErreurApi();
  const router = useRouter();
  const { token } = useAuth();
  const garde = useGardeDoubleFacteur();
  const [cible, setCible] = useState<TeamSuspensionAction | null>(null);

  const userId = owner.user_id;
  const membre = {
    id: userId ?? 0,
    first_name: owner.contact.first_name,
    last_name: owner.contact.last_name,
    email: owner.contact.email,
  };

  const suspension = useMutation<unknown, ApiError, TeamSuspensionAction>({
    mutationFn: (action) => {
      if (!token || userId === null) throw new ApiError(401, { message: tErr('missingToken') });
      return avecGardeDoubleFacteur(() => postTeamSuspension(agencyId, userId, action, token), garde);
    },
    onSuccess: (_r, action) => {
      setCible(null);
      toast.add({ title: action === 'suspend' ? t('suspendu') : t('reactive'), type: 'success' });
      // Le statut affiché est celui de la fiche, relue par la page serveur.
      router.refresh();
    },
    onError: (error) => {
      toast.add({ title: t('echec'), description: messageErreur(error), type: 'error' });
    },
  });

  if (userId === null || owner.status === 'draft') return null;
  const suspendu = owner.status === 'blocked';

  return (
    <section aria-labelledby="acces-et-depart" data-slot="acces-et-depart" className="space-y-2">
      <h2 id="acces-et-depart" className="text-ui font-semibold text-muted-foreground">
        {t('titre')}
      </h2>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <p className="min-w-0 flex-1 text-sm leading-snug text-encre-douce">{suspendu ? t('effetReactiver') : t('effetSuspendre')}</p>
          <button
            type="button"
            onClick={() => setCible(suspendu ? 'reactivate' : 'suspend')}
            className={
              suspendu
                ? 'inline-flex h-11 flex-none items-center rounded-lg border border-border bg-card px-4 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring'
                : 'inline-flex h-11 flex-none items-center rounded-lg border border-destructive/40 px-4 text-sm font-medium text-destructive outline-none hover:bg-destructive/10 focus-visible:ring-3 focus-visible:ring-ring'
            }
          >
            {suspendu ? t('reactiver') : t('suspendre')}
          </button>
        </div>
      </div>
      <ConfirmSuspendDialog
        target={cible ? { member: membre, action: cible } : null}
        onCancel={() => setCible(null)}
        onConfirm={(_m, action) => suspension.mutate(action)}
        isPending={suspension.isPending}
      />
    </section>
  );
}
