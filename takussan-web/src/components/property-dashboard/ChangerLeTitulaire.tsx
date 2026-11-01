'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { nomDuBailleur, useBailleursActifs } from '@/components/property-form/ChoixDuBailleur';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import {
  lireApercuDuTransfert,
  titulaireDuBienKeys,
  transfererLeTitulaire,
  type ApercuDuTransfert,
  type BailDuTransfert,
} from '@/lib/queries/titulaire-du-bien';
import type { ApiResponse } from '@/types/api';

/** Valeur repère de « aucun bailleur choisi » : une valeur vide n'est pas une option du Select. */
const AUCUN_BAILLEUR = '__none__';

/**
 * TCK-999 (P15.06, Q5 ; ADR-0036, amendement du 2026-10-19, voie 3) — « Changer le titulaire » d'un
 * bien que le personnel a saisi à son propre nom. L'admin choisit un bailleur actif de l'agence ; la
 * confirmation dit, AVANT d'écrire, ce qui suit le bien (ses baux en brouillon) et ce qui reste (les
 * baux au-delà du brouillon, les reversements déjà faits). Le bouton n'est rendu que si la fiche le
 * permet (`abilities.transfer_owner`) ; l'API rejuge tout au geste.
 */
export function ChangerLeTitulaire({
  propertyId,
  agencyId,
}: {
  readonly propertyId: number;
  readonly agencyId: number;
}) {
  const t = useTranslations('property.dashboard.ownerTransfer');
  const [ouvert, setOuvert] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)}>
        {t('trigger')}
      </Button>
      {ouvert ? (
        <DialogueDuTransfert propertyId={propertyId} agencyId={agencyId} onFermer={() => setOuvert(false)} />
      ) : null}
    </>
  );
}

function DialogueDuTransfert({
  propertyId,
  agencyId,
  onFermer,
}: {
  readonly propertyId: number;
  readonly agencyId: number;
  readonly onFermer: () => void;
}) {
  const t = useTranslations('property.dashboard.ownerTransfer');
  const tStatut = useTranslations('lease.status');
  const id = useId();
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const messageErreur = useMessageErreurApi();
  const { token } = useAuth();
  const bailleurs = useBailleursActifs(agencyId);
  const options = (bailleurs.data?.data ?? []).filter((b) => b.user_id !== null);
  const [ownerId, setOwnerId] = useState<number | null>(null);

  const apercu = useQuery<ApiResponse<ApercuDuTransfert>, ApiError>({
    queryKey: titulaireDuBienKeys.apercu(propertyId, ownerId ?? 0),
    queryFn: ({ signal }) => lireApercuDuTransfert(token ?? '', propertyId, ownerId as number, { locale, signal }),
    enabled: ownerId !== null && Boolean(token),
    // L'aperçu décrit l'état de l'instant : relu à chaque choix, jamais servi d'un cache ancien.
    staleTime: 0,
    gcTime: 0,
  });

  const transfert = useMutation({
    mutationFn: (cible: number) => {
      if (!token) throw new ApiError(401, { message: t('error') });
      return transfererLeTitulaire(token, propertyId, cible, locale);
    },
    onSuccess: () => {
      toast.add({ title: t('success', { name: apercu.data?.data.new_owner.name ?? '' }), type: 'success' });
      onFermer();
      router.refresh();
    },
  });

  const donnees = apercu.data?.data ?? null;
  const optionsBailleur = [
    { value: AUCUN_BAILLEUR, label: t('ownerPlaceholder') },
    ...options.map((b) => ({ value: String(b.user_id), label: nomDuBailleur(b) })),
  ];
  const libelleDuBail = (bail: BailDuTransfert) => ({
    reference: bail.reference_number ?? `#${bail.id}`,
    status: bail.status ? tStatut(bail.status) : '',
    tenant: bail.tenant_name ?? '',
  });

  return (
    <Dialog open onOpenChange={(next) => (!next && !transfert.isPending ? onFermer() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label htmlFor={id} className="block text-sm font-medium text-foreground">
            {t('ownerLabel')}
          </label>
          <Select
            value={ownerId === null ? AUCUN_BAILLEUR : String(ownerId)}
            disabled={transfert.isPending}
            onValueChange={(next) => {
              if (next === null) return;
              transfert.reset();
              setOwnerId(next === AUCUN_BAILLEUR ? null : Number(next));
            }}
            items={optionsBailleur}
          >
            <SelectTrigger id={id} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {optionsBailleur.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {bailleurs.isLoading ? <p className="text-xs text-muted-foreground">{t('loadingOwners')}</p> : null}
          {!bailleurs.isLoading && options.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('noOwners')}</p>
          ) : null}
        </div>

        {ownerId !== null && apercu.isLoading ? (
          <p className="text-sm text-muted-foreground">{t('loadingPreview')}</p>
        ) : null}

        {donnees ? (
          <div className="space-y-2 rounded-md bg-muted/60 p-3 text-sm text-foreground" data-testid="apercu-du-transfert">
            <p>{t('moving', { count: donnees.leases_moving.length, name: donnees.new_owner.name })}</p>
            {donnees.leases_staying.length > 0 ? (
              <ul className="space-y-1">
                {donnees.leases_staying.map((bail) => (
                  <li key={bail.id}>
                    {bail.tenant_name
                      ? t('staying', libelleDuBail(bail))
                      : t('stayingNoTenant', libelleDuBail(bail))}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-muted-foreground">{t('payouts')}</p>
          </div>
        ) : null}

        {apercu.error ? (
          <p className="text-sm text-destructive" role="alert">
            {messageErreur(apercu.error)}
          </p>
        ) : null}
        {transfert.error ? (
          <p className="text-sm text-destructive" role="alert">
            {messageErreur(transfert.error)}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onFermer} disabled={transfert.isPending}>
            {t('cancel')}
          </Button>
          <Button
            onClick={() => (ownerId !== null ? transfert.mutate(ownerId) : undefined)}
            disabled={donnees === null || transfert.isPending}
          >
            {transfert.isPending ? <Loader2 className="mr-1 size-4 animate-spin" aria-hidden="true" /> : null}
            {transfert.isPending ? t('submitting') : t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
