'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Plus, Save, Trash2 } from 'lucide-react';

import { createAdminPlan, deleteAdminPlan, fetchAdminPlans, updateAdminPlan } from '@/lib/queries/super-admin';
import { lireNombre } from '@/components/forms/FormInput';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import type { Plan } from '@/types/super-admin';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

/**
 * ADR-0135 — le prix et la commission sont des champs TEXTE (profils `montant`, `decimal`) : la frappe reste une
 * chaîne (« 12, » ne s'efface pas), lue en nombre à l'envoi. Vide se lit 0, comme `Number('')` avant ; une saisie
 * illisible rend `null` et bloque le bouton.
 */
function enNombre(saisie: string): number | null {
  if (saisie.trim() === '') return 0;
  const lu = lireNombre(saisie.trim());
  return typeof lu === 'number' ? lu : null;
}

export function AdminPlansClient() {
  const t = useTranslations('billing.plans');
  const tBilling = useTranslations('billing');
  const messageErreur = useMessageErreurApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({ code: '', label: '' });
  const [prix, setPrix] = useState('');
  const [commission, setCommission] = useState('');
  const prixLu = enNombre(prix);
  const commissionLue = enNombre(commission);
  const query = useQuery({ queryKey: ['super-admin', 'plans'], queryFn: fetchAdminPlans });

  const createMutation = useMutation({
    mutationFn: () =>
      createAdminPlan({
        ...draft,
        monthly_price_xof: prixLu ?? 0,
        platform_fee_pct: commissionLue ?? 0,
        limits: { max_active_listings: 10, max_agents: 3, max_branches: 1 },
      }),
    onSuccess: async () => {
      setDraft({ code: '', label: '' });
      setPrix('');
      setCommission('');
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
          <Input profil="reference" aria-label={t('fields.code')} placeholder={t('codePlaceholder')} value={draft.code} onChange={(event) => setDraft((v) => ({ ...v, code: event.target.value }))} />
          <Input profil="mots" aria-label={t('fields.label')} placeholder={t('labelPlaceholder')} value={draft.label} onChange={(event) => setDraft((v) => ({ ...v, label: event.target.value }))} />
          <Input profil="montant" aria-label={t('fields.price')} placeholder={t('pricePlaceholder')} value={prix} onChange={(event) => setPrix(event.target.value)} />
          <Input profil="decimal" enterKeyHint="done" aria-label={t('fields.fee')} placeholder={t('feePlaceholder')} value={commission} onChange={(event) => setCommission(event.target.value)} />
          <Button type="button" disabled={!draft.code || !draft.label || prixLu === null || commissionLue === null || createMutation.isPending} onClick={() => createMutation.mutate()}>
            <Plus className="size-4" aria-hidden="true" />
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
  const [prix, setPrix] = useState(String(plan.monthly_price_xof));
  const [commission, setCommission] = useState(String(plan.platform_fee_pct));
  const prixLu = enNombre(prix);
  const commissionLue = enNombre(commission);
  const updateMutation = useMutation({
    mutationFn: () => updateAdminPlan(plan.id, { ...draft, monthly_price_xof: prixLu ?? 0, platform_fee_pct: commissionLue ?? 0 }),
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
        <Input profil="reference" aria-label={t('fields.code')} placeholder={t('exemples.code')} value={draft.code} onChange={(event) => setDraft((v) => ({ ...v, code: event.target.value }))} />
        <Input profil="mots" aria-label={t('fields.label')} placeholder={t('exemples.label')} value={draft.label} onChange={(event) => setDraft((v) => ({ ...v, label: event.target.value }))} />
        <Input profil="montant" aria-label={t('fields.price')} placeholder={t('exemples.price')} value={prix} onChange={(event) => setPrix(event.target.value)} />
        <Input profil="decimal" enterKeyHint="done" aria-label={t('fields.fee')} placeholder={t('exemples.fee')} value={commission} onChange={(event) => setCommission(event.target.value)} />
        <Button type="button" variant="outline" disabled={updateMutation.isPending || prixLu === null || commissionLue === null} onClick={() => updateMutation.mutate()}>
          <Save className="size-4" aria-hidden="true" />
          {t('save')}
        </Button>
        <Button type="button" variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
          <Trash2 className="size-4" aria-hidden="true" />
          {t('delete')}
        </Button>
      </CardContent>
    </Card>
  );
}

