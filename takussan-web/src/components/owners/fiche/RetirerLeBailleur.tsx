'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import {
  cheminDuDepart,
  deleteOwnerFromAgency,
  RAISONS_DU_DEPART,
  type OwnerDepartureInventory,
  type OwnerDepartureResult,
} from '@/lib/queries/owner-departure';

/**
 * TCK-2753 (ADR-0108) — « Retirer de l'agence » : le dialogue de la fiche d'un bailleur.
 *
 * Il lit d'abord `GET /api/owners/{id}/departure`, le même inventaire que le refus du geste.
 *
 *  · **Quelque chose bloque** (`can_depart: false`) : il le dit en mots, avec les nombres (« 2 biens
 *    encore dans l'agence », « 180 000 F restent à lui verser »…), et ne propose pas de confirmer.
 *  · **Sinon** : il dit l'effet — plus d'accès à l'agence, l'histoire reste, un solde négatif est à
 *    recouvrer hors de la plateforme — puis `DELETE /api/owners/{id}`, sous la double
 *    authentification de l'agence (TCK-1203, `avecGardeDoubleFacteur`).
 *
 * Un refus du `DELETE` (l'inventaire a changé entre la lecture et le geste) relit l'inventaire : le
 * dialogue passe alors de lui-même à la liste de ce qui bloque.
 */
export function RetirerLeBailleur({
  ownerProfileId,
  nom,
  devise,
  open,
  onOpenChange,
}: {
  readonly ownerProfileId: number;
  readonly nom: string;
  readonly devise: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('owners.fiche.depart');
  const tErr = useTranslations('errors');
  const f = useFormatteurs();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const messageErreur = useMessageErreurApi();
  const garde = useGardeDoubleFacteur();
  const { token } = useAuth();
  const cle = ['owners', ownerProfileId, 'departure'] as const;

  const lecture = useApiQuery<{ data: OwnerDepartureInventory }>(cle, cheminDuDepart(ownerProfileId), { enabled: open, staleTime: 0 });
  const inventaire = lecture.data?.data ?? null;

  const retrait = useMutation<{ data: OwnerDepartureResult }, ApiError>({
    mutationFn: () => {
      if (!token) throw new ApiError(401, { message: tErr('missingToken') });
      return avecGardeDoubleFacteur(() => deleteOwnerFromAgency(token, ownerProfileId), garde);
    },
    onSuccess: () => {
      onOpenChange(false);
      toast.add({ title: t('retire', { nom }), type: 'success' });
      // « Parti le … » et les gestes retirés se lisent sur la fiche, relue par la page serveur.
      router.refresh();
    },
    onError: (error) => {
      toast.add({ title: t('echec'), description: messageErreur(error), type: 'error' });
      if (error.status === 422) void queryClient.invalidateQueries({ queryKey: cle });
    },
  });

  const raisons = inventaire
    ? RAISONS_DU_DEPART.filter((raison) => inventaire.blocking[raison] > 0).map((raison) =>
        raison === 'positive_balance'
          ? t('bloque.positive_balance', { montant: f.montantCourt(inventaire.balance?.remaining_to_pay ?? 0, devise) })
          : t(`bloque.${raison}`, { count: inventaire.blocking[raison] }),
      )
    : [];
  const solde = inventaire?.balance?.remaining_to_pay ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(suivant) => {
        if (retrait.isPending) return;
        onOpenChange(suivant);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('titre', { nom })}</DialogTitle>
          {inventaire && !inventaire.can_depart ? (
            <DialogDescription>{raisons.length > 0 ? t('bloqueIntro') : t('impossible')}</DialogDescription>
          ) : (
            <DialogDescription>{t('effet')}</DialogDescription>
          )}
        </DialogHeader>

        {lecture.isPending ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : lecture.isError ? (
          <ErrorState message={messageErreur(lecture.error, t('lectureEchouee'))} />
        ) : inventaire && !inventaire.can_depart ? (
          raisons.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm" data-testid="raisons-du-depart">
              {raisons.map((raison) => (
                <li key={raison}>{raison}</li>
              ))}
            </ul>
          ) : null
        ) : (
          <div className="space-y-2 text-sm">
            <p>{t('historique')}</p>
            {solde < 0 ? <p>{t('aRecouvrer', { montant: f.montantCourt(-solde, devise) })}</p> : null}
          </div>
        )}

        <div className="mt-5 flex justify-between gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={retrait.isPending}>
            {inventaire && !inventaire.can_depart ? t('fermer') : t('annuler')}
          </Button>
          {inventaire?.can_depart ? (
            <Button type="button" variant="destructive" onClick={() => retrait.mutate()} disabled={retrait.isPending}>
              {retrait.isPending ? t('enCours') : t('confirmer')}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
