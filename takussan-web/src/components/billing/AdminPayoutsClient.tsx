'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fetchAdminPlatformPayouts } from '@/lib/queries/super-admin';
import type { PlatformPayoutStatus } from '@/types/super-admin';
import { PayoutCloseDialog } from './PayoutCloseDialog';
import { PayoutDetailPanel } from './PayoutDetailPanel';
import { PayoutTable } from './PayoutTable';

const ALL_STATUS = '__all__';

const STATUSES: { value: string; label: string }[] = [
  { value: ALL_STATUS, label: 'Tous statuts' },
  { value: 'pending', label: 'En attente' },
  { value: 'approved', label: 'Approuvé' },
  { value: 'processing', label: 'En cours' },
  { value: 'paid', label: 'Payé' },
  { value: 'failed', label: 'Échec' },
  { value: 'cancelled', label: 'Annulé' },
];

export function AdminPayoutsClient() {
  const [agencyFilter, setAgencyFilter] = useState('');
  const [status, setStatus] = useState<PlatformPayoutStatus | ''>('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const query = useQuery({
    queryKey: ['super-admin', 'payouts', { agency: agencyFilter, status }],
    queryFn: () =>
      fetchAdminPlatformPayouts({
        agencyId: agencyFilter ? Number(agencyFilter) : null,
        status: status || undefined,
        perPage: 30,
      }),
  });

  const payouts = query.data?.data ?? [];

  return (
    <div className="space-y-5">
      <PayoutCloseDialog defaultAgencyId={agencyFilter ? Number(agencyFilter) : null} />

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[180px_180px_1fr]">
          <Input
            type="number"
            placeholder="Filtrer par agence (id)"
            value={agencyFilter}
            onChange={(event) => setAgencyFilter(event.target.value)}
            aria-label="Filtrer par agence"
          />
          <Select
            value={status || ALL_STATUS}
            onValueChange={(value) => setStatus(value === ALL_STATUS ? '' : ((value ?? '') as PlatformPayoutStatus | ''))}
            items={STATUSES}
          >
            <SelectTrigger className="h-9" aria-label="Filtrer par statut">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="self-center text-xs text-muted-foreground">
            {query.data?.meta?.total ?? 0} reversement{(query.data?.meta?.total ?? 0) > 1 ? 's' : ''} — tri par fin de période décroissante.
          </p>
        </CardContent>
      </Card>

      <PayoutTable
        payouts={payouts}
        isLoading={query.isLoading}
        onSelect={(payout) => setSelectedId(payout.id)}
      />

      {selectedId !== null ? (
        <PayoutDetailPanel payoutId={selectedId} onClose={() => setSelectedId(null)} />
      ) : null}
    </div>
  );
}
