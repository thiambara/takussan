'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, Trash2 } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { createAdminPlan, deleteAdminPlan, fetchAdminPlans, updateAdminPlan } from '@/lib/queries/super-admin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import type { Plan } from '@/types/super-admin';

export function AdminPlansClient() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({ code: '', label: '', monthly_price_xof: 0, platform_fee_pct: 0 });
  const query = useQuery({ queryKey: ['super-admin', 'plans'], queryFn: fetchAdminPlans });

  const createMutation = useMutation({
    mutationFn: () => createAdminPlan({ ...draft, limits: { max_active_listings: 10, max_agents: 3, max_branches: 1 } }),
    onSuccess: async () => {
      setDraft({ code: '', label: '', monthly_price_xof: 0, platform_fee_pct: 0 });
      toast.add({ title: 'Plan créé', type: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['super-admin', 'plans'] });
    },
    onError: (error) => toast.add({ title: 'Création impossible', description: messageFor(error), type: 'error' }),
  });

  if (query.isLoading) return <Skeleton className="h-72 rounded-xl" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Nouveau plan</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_1fr_160px_140px_auto]">
          <Input placeholder="code" value={draft.code} onChange={(event) => setDraft((v) => ({ ...v, code: event.target.value }))} />
          <Input placeholder="libellé" value={draft.label} onChange={(event) => setDraft((v) => ({ ...v, label: event.target.value }))} />
          <Input type="number" placeholder="prix XOF" value={draft.monthly_price_xof} onChange={(event) => setDraft((v) => ({ ...v, monthly_price_xof: Number(event.target.value) }))} />
          <Input type="number" placeholder="fee %" value={draft.platform_fee_pct} onChange={(event) => setDraft((v) => ({ ...v, platform_fee_pct: Number(event.target.value) }))} />
          <Button type="button" disabled={!draft.code || !draft.label || createMutation.isPending} onClick={() => createMutation.mutate()}>
            <Plus className="mr-2 size-4" aria-hidden="true" />
            Créer
          </Button>
        </CardContent>
      </Card>
      {(query.data?.data ?? []).map((plan) => <PlanRow key={plan.id} plan={plan} />)}
    </div>
  );
}

function PlanRow({ plan }: { plan: Plan }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(plan);
  const updateMutation = useMutation({
    mutationFn: () => updateAdminPlan(plan.id, draft),
    onSuccess: async () => {
      toast.add({ title: 'Plan mis à jour', type: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['super-admin', 'plans'] });
    },
    onError: (error) => toast.add({ title: 'Mise à jour impossible', description: messageFor(error), type: 'error' }),
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteAdminPlan(plan.id),
    onSuccess: async () => {
      toast.add({ title: 'Plan supprimé', type: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['super-admin', 'plans'] });
    },
    onError: (error) => toast.add({ title: 'Suppression impossible', description: messageFor(error), type: 'error' }),
  });

  return (
    <Card>
      <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_160px_140px_auto_auto]">
        <Input value={draft.code} onChange={(event) => setDraft((v) => ({ ...v, code: event.target.value }))} />
        <Input value={draft.label} onChange={(event) => setDraft((v) => ({ ...v, label: event.target.value }))} />
        <Input type="number" value={draft.monthly_price_xof} onChange={(event) => setDraft((v) => ({ ...v, monthly_price_xof: Number(event.target.value) }))} />
        <Input type="number" value={draft.platform_fee_pct} onChange={(event) => setDraft((v) => ({ ...v, platform_fee_pct: Number(event.target.value) }))} />
        <Button type="button" variant="outline" disabled={updateMutation.isPending} onClick={() => updateMutation.mutate()}>
          <Save className="mr-2 size-4" aria-hidden="true" />
          Enregistrer
        </Button>
        <Button type="button" variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
          <Trash2 className="mr-2 size-4" aria-hidden="true" />
          Supprimer
        </Button>
      </CardContent>
    </Card>
  );
}

function messageFor(error: unknown): string {
  return error instanceof ApiError ? error.displayMessage : 'Réessayez dans quelques instants.';
}
