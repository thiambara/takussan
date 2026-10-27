'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { StatusBadge } from '@/components/console';
import { DataTable, type DataTableColumn } from '@/components/console/DataTable';
import { ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { ApiError } from '@/lib/api';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { deleteAdminAiRole, fetchAdminAiRoles } from '@/lib/queries/super-admin';
import type { AdminAiRolesResponse, AiRoleRow } from '@/types/super-admin';
import { AiChainDialog } from './AiChainDialog';

export function AiRolesPanel() {
  const t = useTranslations('superAdmin.pages.ai.roles');
  const tShared = useTranslations('superAdmin.pages.shared');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const garde = useGardeDoubleFacteur();
  const queryClient = useQueryClient();
  const [edited, setEdited] = useState<AiRoleRow | null>(null);
  const query = useQuery<AdminAiRolesResponse, ApiError>({ queryKey: ['super-admin', 'ai', 'roles'], queryFn: fetchAdminAiRoles });
  const reset = useMutation({
    mutationFn: (row: AiRoleRow) => avecGardeDoubleFacteur(() => deleteAdminAiRole(row.role), garde),
    onSuccess: (data) => {
      queryClient.setQueryData(['super-admin', 'ai', 'roles'], data);
      // La chaîne d'un usage dérive de celle de son rôle : la lecture des usages est périmée.
      void queryClient.invalidateQueries({ queryKey: ['super-admin', 'ai', 'usages'] });
    },
  });

  if (query.isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (query.isError) {
    return <ErrorState message={`${tShared('loadError')} ${messageErreur(query.error)}`} onRetry={() => void query.refetch()} retryLabel={tCommon('actions.retry')} />;
  }

  const columns: DataTableColumn<AiRoleRow>[] = [
    { id: 'role', header: t('role'), cell: (row) => <span className="font-medium">{t(`names.${row.role}`)}</span> },
    {
      id: 'chain',
      header: t('chain'),
      cell: (row) => row.chain.length === 0
        ? <span className="text-muted-foreground">{t('emptyChain')}</span>
        : <ol className="space-y-0.5">{row.chain.map((link, i) => <li key={`${link.provider}-${link.model}-${i}`}>{`${i + 1}. ${link.provider} · ${link.model}`}</li>)}</ol>,
    },
    {
      id: 'source',
      header: t('source'),
      cell: (row) => <StatusBadge label={row.source === 'database' ? t('sourceDatabase') : t('sourceConfig')} tone={row.source === 'database' ? 'info' : 'neutral'} />,
    },
    {
      id: 'actions',
      header: t('edit'),
      headerSrOnly: true,
      align: 'end',
      cell: (row) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setEdited(row)}>{t('edit')}</Button>
          {row.source === 'database' ? (
            <Button size="sm" variant="ghost" disabled={reset.isPending} onClick={() => reset.mutate(row)}>{t('reset')}</Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      {reset.isError ? <p className="text-sm text-destructive" role="alert">{messageErreur(reset.error, t('resetFailed'))}</p> : null}
      <DataTable caption={t('caption')} columns={columns} rows={query.data?.data.roles ?? []} rowKey={(row) => row.role} />
      {edited ? (
        <AiChainDialog open onOpenChange={(open) => { if (!open) setEdited(null); }} row={edited} providers={query.data?.data.providers ?? []} />
      ) : null}
    </div>
  );
}
