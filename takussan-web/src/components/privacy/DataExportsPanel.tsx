'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileArchive, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { fetchMyDataExports, requestMyDataExport } from '@/lib/queries/data-exports';
import type { DataExport } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';

export function DataExportsPanel() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['me', 'data-exports'],
    queryFn: fetchMyDataExports,
    staleTime: 30_000,
  });
  const mutation = useMutation({
    mutationFn: requestMyDataExport,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me', 'data-exports'] }),
  });
  const error = mutation.error as ApiError | null;

  return (
    <section className="rounded-xl bg-white p-5 ring-1 ring-stone-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-stone-100 text-primary">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-stone-950">Mes données</h2>
            <p className="mt-1 text-sm text-stone-600">Archive ZIP de portabilité personnelle.</p>
          </div>
        </div>
        <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          <FileArchive className="size-4" aria-hidden="true" />
          Demander mon export
        </Button>
      </div>

      {error ? <p className="mt-3 text-sm text-destructive">{error.displayMessage}</p> : null}

      <div className="mt-5 divide-y divide-stone-100 rounded-lg border border-stone-200">
        {(query.data?.data ?? []).map((dataExport) => (
          <DataExportRow key={dataExport.id} dataExport={dataExport} />
        ))}
        {!query.isLoading && (query.data?.data ?? []).length === 0 ? (
          <p className="p-4 text-sm text-stone-500">Aucun export demandé.</p>
        ) : null}
      </div>
    </section>
  );
}

function DataExportRow({ dataExport }: { dataExport: DataExport }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
      <div>
        <p className="font-medium text-stone-950">Export #{dataExport.id}</p>
        <p className="text-stone-600">
          Demandé le {new Date(dataExport.requested_at).toLocaleString('fr-FR')}
          {dataExport.expires_at ? ` · expire le ${new Date(dataExport.expires_at).toLocaleDateString('fr-FR')}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={dataExport.status === 'ready' ? 'secondary' : 'outline'}>{dataExport.status}</Badge>
        {dataExport.status === 'ready' ? (
          <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={`/api/data-exports/${dataExport.id}/download`}>
            <Download className="size-4" aria-hidden="true" />
            Télécharger
          </Link>
        ) : null}
      </div>
    </div>
  );
}
