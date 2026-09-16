'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ListTree } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/feedback';
import { useQuery } from '@tanstack/react-query';
import {
  EnumList,
  EnumValueDialog,
  EnumValueTable,
} from '@/components/admin/super/business-enums';
import { fetchBusinessEnums } from '@/lib/queries/super-admin';
import type { BusinessEnumsResponse, BusinessEnumValue } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { PageHeader } from '@/components/console';
import { Skeleton } from '@/components/ui/skeleton';
import { WarningBanner } from '@/components/ui/warning-banner';

export default function SuperAdminEnumsPage() {
  const t = useTranslations('superAdmin.enums');
  const tPage = useTranslations('superAdmin.pages.enums');
  const tShared = useTranslations('superAdmin.pages.shared');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<BusinessEnumValue | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const query = useQuery<BusinessEnumsResponse, ApiError>({
    queryKey: ['super-admin', 'business-enums'],
    queryFn: fetchBusinessEnums,
    staleTime: 30_000,
  });

  const enums = useMemo(() => query.data?.data ?? [], [query.data]);
  const activeKey = selectedKey ?? enums[0]?.key ?? '';
  const selected = useMemo(
    () => enums.find((item) => item.key === activeKey) ?? enums[0] ?? null,
    [activeKey, enums],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={tPage('title')}
        description={tPage('subtitle')}
      />

      <WarningBanner>{tPage('lockedNotice')}</WarningBanner>

      {query.isLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : query.isError ? (
        <ErrorState
          message={`${tShared('loadError')} ${messageErreur(query.error)}`}
          onRetry={() => void query.refetch()}
          retryLabel={tCommon('actions.retry')}
        />
      ) : selected ? (
        <div className="grid items-start gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          {/* Liste + panneau dès `xl` : à 1024 la coque laisse 720 px, 280 px de liste ne laissaient
            que 424 px à une table de six colonnes. `items-start` : la liste ne s'étire plus
            sur toute la hauteur de la table. */}
          <EnumList enums={enums} selectedKey={selected.key} onSelect={setSelectedKey} />
          <EnumValueTable
            item={selected}
            onEdit={(value) => {
              setEditing(value);
              setDialogOpen(true);
            }}
            onAdd={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          />
          <EnumValueDialog
            enumKey={selected.key}
            value={editing}
            open={dialogOpen}
            onOpenChange={setDialogOpen}
          />
        </div>
      ) : (
        <EmptyState
          icon={<ListTree className="size-8" aria-hidden="true" />}
          title={t('empty_title')}
          description={t('empty_description')}
        />
      )}
    </div>
  );
}
