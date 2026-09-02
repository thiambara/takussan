'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Plus, Save, Trash2 } from 'lucide-react';

import { createAdminPlan, deleteAdminPlan, fetchAdminPlans, updateAdminPlan } from '@/lib/queries/super-admin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import type { Plan } from '@/types/super-admin';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

export function AdminPlansClient() {
  const t = useTranslations('billing.plans');
  const tBilling = useTranslations('billing');
  const messageErreur = useMessageErreurApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({ code: '', label: '', monthly_price_xof: 0, platform_fee_pct: 0 });
  const query = useQuery({ queryKey: ['super-admin', 'plans'], queryFn: fetchAdminPlans });

  const createMutation = useMutation({
    mutationFn: () => createAdminPlan({ ...draft, limits: { max_active_listings: 10, max_agents: 3, max_branches: 1 } }),
    onSuccess: async () => {
      setDraft({ code: '', label: '', monthly_price_xof: 0, platform_fee_pct: 0 });
      toast.add({ title: t('toast.created'), type: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['super-admin', 'plans'] });
    },
    onError: (error) => toast.add({ title: t('toast.createFailed'), description: messageErreur(error, tBilling('retryLater')), type: 'error' }),
  });

  if (query.isLoading) return <Skeleton className="h-72 rounded-xl" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('newPlan')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 xl:grid-cols-[1fr_1fr_160px_140px_auto]">
          <Input placeholder={t('codePlaceholder')} value={draft.code} onChange={(event) => setDraft((v) => ({ ...v, code: event.target.value }))} />
          <Input placeholder={t('labelPlaceholder')} value={draft.label} onChange={(event) => setDraft((v) => ({ ...v, label: event.target.value }))} />
          <Input type="number" placeholder={t('pricePlaceholder')} value={draft.monthly_price_xof} onChange={(event) => setDraft((v) => ({ ...v, monthly_price_xof: Number(event.target.value) }))} />
          <Input type="number" placeholder={t('feePlaceholder')} value={draft.platform_fee_pct} onChange={(event) => setDraft((v) => ({ ...v, platform_fee_pct: Number(event.target.value) }))} />
          <Button type="button" disabled={!draft.code || !draft.label || createMutation.isPending} onClick={() => createMutation.mutate()}>
            <Plus className="mr-2 size-4" aria-hidden="true" />
            {t('create')}
          </Button>
        </CardContent>
      </Card>
      {(query.data?.data ?? []).map((plan) => <PlanRow key={plan.id} plan={plan} />)}
    </div>
  );
}

function PlanRow({ plan }: { plan: Plan }) {
  const t = useTranslations('billing.plans');
  const tBilling = useTranslations('billing');
  const messageErreur = useMessageErreurApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(plan);
  const updateMutation = useMutation({
    mutationFn: () => updateAdminPlan(plan.id, draft),
    onSuccess: async () => {
      toast.add({ title: t('toast.updated'), type: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['super-admin', 'plans'] });
    },
    onError: (error) => toast.add({ title: t('toast.updateFailed'), description: messageErreur(error, tBilling('retryLater')), type: 'error' }),
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteAdminPlan(plan.id),
    onSuccess: async () => {
      toast.add({ title: t('toast.deleted'), type: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['super-admin', 'plans'] });
    },
    onError: (error) => toast.add({ title: t('toast.deleteFailed'), description: messageErreur(error, tBilling('retryLater')), type: 'error' }),
  });

  return (
    <Card>
      <CardContent className="grid gap-3 p-4 xl:grid-cols-[1fr_1fr_160px_140px_auto_auto]">
        <Input value={draft.code} onChange={(event) => setDraft((v) => ({ ...v, code: event.target.value }))} />
        <Input value={draft.label} onChange={(event) => setDraft((v) => ({ ...v, label: event.target.value }))} />
        <Input type="number" value={draft.monthly_price_xof} onChange={(event) => setDraft((v) => ({ ...v, monthly_price_xof: Number(event.target.value) }))} />
        <Input type="number" value={draft.platform_fee_pct} onChange={(event) => setDraft((v) => ({ ...v, platform_fee_pct: Number(event.target.value) }))} />
        <Button type="button" variant="outline" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate()}>
          <Save className="mr-2 size-4" aria-hidden="true" />
          {t('save')}
        </Button>
        <Button type="button" variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
          <Trash2 className="mr-2 size-4" aria-hidden="true" />
          {t('delete')}
        </Button>
      </CardContent>
    </Card>
  );
}

