'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchAdminKycQueue } from '@/lib/queries/super-admin';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/kyc/kyc-components';

export default function Page() {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['super-admin', 'kyc', page],
    queryFn: () => fetchAdminKycQueue({ page, perPage: 20 }),
  });

  const dossiers = query.data?.data ?? [];
  const meta = query.data?.meta;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">File KYC</h1>
        <p className="mt-1 text-sm text-muted-foreground">Dossiers agence soumis, triés du plus ancien au plus récent.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Dossiers soumis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {query.isLoading ? <Skeleton className="h-28" /> : null}
          {!query.isLoading && dossiers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun dossier soumis.</p>
          ) : null}
          {dossiers.map((dossier) => (
            <div key={dossier.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Building2 className="size-4 text-primary" aria-hidden="true" />
                  <p className="font-medium text-foreground">Agence #{dossier.subject_id}</p>
                  <StatusBadge status={dossier.status} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Soumis le {formatDate(dossier.submitted_at)}</p>
              </div>
              <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={`/super-admin/agencies/${dossier.subject_id}`}>
                Ouvrir
              </Link>
            </div>
          ))}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              <ChevronLeft className="mr-1 size-4" aria-hidden="true" />
              Précédent
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {meta?.current_page ?? page} / {meta?.last_page ?? 1}
            </span>
            <Button type="button" variant="outline" size="sm" disabled={!meta || page >= meta.last_page} onClick={() => setPage((value) => value + 1)}>
              Suivant
              <ChevronRight className="ml-1 size-4" aria-hidden="true" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
