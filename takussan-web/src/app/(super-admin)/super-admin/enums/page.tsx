'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ListTree } from 'lucide-react';
import { EmptyState } from '@/components/feedback';
import { useQuery } from '@tanstack/react-query';
import {
  EnumList,
  EnumValueDialog,
  EnumValueTable,
} from '@/components/admin/super/business-enums';
import { fetchBusinessEnums } from '@/lib/queries/super-admin';
import type { BusinessEnumsResponse, BusinessEnumValue } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';

export default function SuperAdminEnumsPage() {
  const t = useTranslations('superAdmin.enums');
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
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">Enums métier</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gérez les libellés FR / EN / WO et les valeurs métier non techniques.
        </p>
      </header>

      {/* Warning banner: amber Tailwind kept as documented exception (TCK-245) — no `--warning` DS token available. */}
      <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200">
        Les enums techniques comme paiements, rôles et statuts internes restent verrouillés dans le code.
      </div>

      {query.isLoading ? (
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
      ) : query.isError ? (
        <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive ring-1 ring-destructive/20">
          Erreur de chargement. {query.error.displayMessage}
        </div>
      ) : selected ? (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
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
