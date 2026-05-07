'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';
import { closeAdminPlatformPayoutPeriod } from '@/lib/queries/super-admin';

/**
 * TCK-223 — Close-period composer. Period_end is required; agency_id is
 * optional (omit to fan out across all agencies with eligible payments).
 */
export function PayoutCloseDialog({ defaultAgencyId }: { defaultAgencyId?: number | null }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [periodEnd, setPeriodEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [agencyId, setAgencyId] = useState(defaultAgencyId ? String(defaultAgencyId) : '');

  const mutation = useMutation({
    mutationFn: () =>
      closeAdminPlatformPayoutPeriod({
        period_end: periodEnd,
        agency_id: agencyId ? Number(agencyId) : null,
      }),
    onSuccess: async (result) => {
      const count = result.data.length;
      toast.add({
        title: count === 0 ? 'Aucun paiement éligible' : `${count} payout${count > 1 ? 's' : ''} créé${count > 1 ? 's' : ''}`,
        type: count === 0 ? 'info' : 'success',
      });
      await queryClient.invalidateQueries({ queryKey: ['super-admin', 'payouts'] });
    },
    onError: (error) => {
      toast.add({ title: 'Clôture impossible', description: messageFor(error), type: 'error' });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clôturer une période</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-[160px_180px_auto]">
        <Input
          type="date"
          value={periodEnd}
          onChange={(event) => setPeriodEnd(event.target.value)}
          aria-label="Période fin"
        />
        <Input
          type="number"
          placeholder="Agence (vide = toutes)"
          value={agencyId}
          onChange={(event) => setAgencyId(event.target.value)}
          aria-label="Agence"
        />
        <Button
          type="button"
          disabled={!periodEnd || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
          Clôturer
        </Button>
      </CardContent>
    </Card>
  );
}

function messageFor(error: unknown): string {
  return error instanceof ApiError ? error.displayMessage : 'Réessayez dans quelques instants.';
}
