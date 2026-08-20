'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Save, XCircle } from 'lucide-react';

import { assignAdminAgencySubscription, cancelAdminAgencySubscription, fetchAdminAgencySubscription, fetchAdminPlans } from '@/lib/queries/super-admin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { SubscriptionSummary } from './SubscriptionSummary';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

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

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
      <SubscriptionSummary subscription={subscriptionQuery.data?.data ?? null} />
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
  );
}

