'use client';

import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { SlidersHorizontal, Save, XCircle } from 'lucide-react';

import {
  assignAdminAgencySubscription,
  cancelAdminAgencySubscription,
  fetchAdminAgencySubscription,
  fetchAdminPlans,
  updateAdminAgencySubscriptionOverrides,
} from '@/lib/queries/super-admin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { SubscriptionSummary } from './SubscriptionSummary';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { AgencySubscription } from '@/types/super-admin';

export function AdminAgencySubscriptionPanel({ agencyId }: { agencyId: number }) {
  const t = useTranslations('billing.agencySubscription');
  const tBilling = useTranslations('billing');
  const messageErreur = useMessageErreurApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [planId, setPlanId] = useState('');
  const [fee, setFee] = useState('');
  const [maxListings, setMaxListings] = useState('');
  const subscriptionQuery = useQuery({
    queryKey: ['super-admin', 'agency', agencyId, 'subscription'],
    queryFn: () => fetchAdminAgencySubscription(agencyId),
  });
  const plansQuery = useQuery({ queryKey: ['super-admin', 'plans'], queryFn: fetchAdminPlans });

  const assignMutation = useMutation({
    mutationFn: () => assignAdminAgencySubscription(agencyId, {
      plan_id: Number(planId),
      overrides: {
        platform_fee_pct: fee === '' ? undefined : Number(fee),
        limits: maxListings === '' ? undefined : { max_active_listings: Number(maxListings) },
      },
    }),
    onSuccess: async () => {
      toast.add({ title: t('toast.assigned'), type: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['super-admin', 'agency', agencyId, 'subscription'] });
    },
    onError: (error) => toast.add({ title: t('toast.assignFailed'), description: messageErreur(error, tBilling('retryLater')), type: 'error' }),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelAdminAgencySubscription(agencyId),
    onSuccess: async () => {
      toast.add({ title: t('toast.closed'), type: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['super-admin', 'agency', agencyId, 'subscription'] });
    },
    onError: (error) => toast.add({ title: t('toast.closeFailed'), description: messageErreur(error, tBilling('retryLater')), type: 'error' }),
  });

  if (subscriptionQuery.isLoading || plansQuery.isLoading) return <Skeleton className="h-72 rounded-xl" />;

  const subscription = subscriptionQuery.data?.data ?? null;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
      <SubscriptionSummary subscription={subscription} showOverrides />
      <div className="space-y-4">
        {subscription && (
          // La clé remonte le formulaire quand l'abonnement change : ses champs repartent de la ligne.
          <OverridesCard key={`${subscription.id}-${subscription.updated_at ?? ''}`} agencyId={agencyId} subscription={subscription} />
        )}
        <Card>
          <CardHeader>
            <CardTitle>{t('changePlan')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={planId} onValueChange={(value) => setPlanId(value ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder={t('choosePlan')} />
              </SelectTrigger>
              <SelectContent>
                {(plansQuery.data?.data ?? []).map((plan) => (
                  <SelectItem key={plan.id} value={String(plan.id)}>{plan.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="number" placeholder={t('feeOverride')} value={fee} onChange={(event) => setFee(event.target.value)} />
            <Input type="number" placeholder={t('listingsOverride')} value={maxListings} onChange={(event) => setMaxListings(event.target.value)} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" disabled={!planId || assignMutation.isPending} onClick={() => assignMutation.mutate()}>
                <Save className="mr-2 size-4" aria-hidden="true" />
                {t('assign')}
              </Button>
              <Button type="button" variant="destructive" disabled={!subscriptionQuery.data?.data || cancelMutation.isPending} onClick={() => cancelMutation.mutate()}>
                <XCircle className="mr-2 size-4" aria-hidden="true" />
                {t('close')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const LIMITES = ['max_active_listings', 'max_agents', 'max_branches'] as const;
type Limite = (typeof LIMITES)[number];
const LIBELLE_LIMITE: Record<Limite, 'listings' | 'agents' | 'branches'> = {
  max_active_listings: 'listings',
  max_agents: 'agents',
  max_branches: 'branches',
};

function enChamp(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function enValeur(champ: string): number | null {
  return champ.trim() === '' ? null : Number(champ);
}

/**
 * TCK-2222 (P214.01, décision du porteur du 2026-10-24) — « Modifier les dérogations », séparé de
 * « Changer de plan » : modifie sur place l'abonnement ouvert (commission, trois quotas), sans le
 * clore ; la période et l'essai restent. Les champs partent des dérogations en cours, et les quatre
 * partent toujours : un champ vide retire la dérogation, la valeur du plan revient.
 */
function OverridesCard({ agencyId, subscription }: { readonly agencyId: number; readonly subscription: AgencySubscription }) {
  const t = useTranslations('billing.agencySubscription');
  const tBilling = useTranslations('billing');
  const messageErreur = useMessageErreurApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const idTitre = useId();
  const idChamp = useId();
  const [fee, setFee] = useState(enChamp(subscription.platform_fee_pct_override));
  const [limits, setLimits] = useState<Record<Limite, string>>({
    max_active_listings: enChamp(subscription.limits_override?.max_active_listings),
    max_agents: enChamp(subscription.limits_override?.max_agents),
    max_branches: enChamp(subscription.limits_override?.max_branches),
  });

  const mutation = useMutation({
    mutationFn: () => updateAdminAgencySubscriptionOverrides(agencyId, {
      platform_fee_pct: enValeur(fee),
      limits: {
        max_active_listings: enValeur(limits.max_active_listings),
        max_agents: enValeur(limits.max_agents),
        max_branches: enValeur(limits.max_branches),
      },
    }),
    onSuccess: async () => {
      toast.add({ title: t('toast.overridesSaved'), type: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['super-admin', 'agency', agencyId, 'subscription'] });
    },
    onError: (error) => toast.add({ title: t('toast.overridesFailed'), description: messageErreur(error, tBilling('retryLater')), type: 'error' }),
  });

  return (
    <Card role="region" aria-labelledby={idTitre}>
      <CardHeader>
        <CardTitle id={idTitre}>{t('overrides.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t('overrides.hint')}</p>
        <div className="space-y-1.5">
          <Label htmlFor={`${idChamp}-fee`}>{t('overrides.fee')}</Label>
          <Input
            id={`${idChamp}-fee`}
            type="number"
            min={0}
            max={100}
            step="0.01"
            placeholder={t('overrides.planValue')}
            value={fee}
            onChange={(event) => setFee(event.target.value)}
          />
        </div>
        {LIMITES.map((cle) => (
          <div key={cle} className="space-y-1.5">
            <Label htmlFor={`${idChamp}-${cle}`}>{t(`overrides.${LIBELLE_LIMITE[cle]}`)}</Label>
            <Input
              id={`${idChamp}-${cle}`}
              type="number"
              min={0}
              step="1"
              placeholder={t('overrides.planValue')}
              value={limits[cle]}
              onChange={(event) => setLimits((courant) => ({ ...courant, [cle]: event.target.value }))}
            />
          </div>
        ))}
        <div className="flex justify-end">
          <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            <SlidersHorizontal className="mr-2 size-4" aria-hidden="true" />
            {t('overrides.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

