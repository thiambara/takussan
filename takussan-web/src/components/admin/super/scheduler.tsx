'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Timer } from 'lucide-react';
import { DataTable, type DataTableColumn } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { fetchScheduler } from '@/lib/queries/super-admin';
import type { ScheduledTask } from '@/types/super-admin';

export function ScheduledTaskTable() {
  const t = useTranslations('superAdmin.scheduler');
  const fmt = useFormatteurs();
  const query = useQuery({
    queryKey: ['super-admin', 'scheduler'],
    queryFn: fetchScheduler,
    refetchInterval: 30_000,
  });

  const tasks = query.data?.data ?? [];
  const columns: DataTableColumn<ScheduledTask>[] = [
    { id: 'task', header: t('colTask'), className: 'font-medium text-foreground', cell: (task) => task.task },
    {
      id: 'lastRun',
      header: t('colLastRun'),
      className: 'text-muted-foreground',
      cell: (task) => fmt.dateTime(task.last_run_at),
    },
    {
      id: 'avgDuration',
      header: t('colAvgDuration'),
      className: 'text-muted-foreground',
      cell: (task) => (task.average_duration_ms ? `${task.average_duration_ms}ms` : '—'),
    },
  ];

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-foreground">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <DataTable
        caption={t('tableCaption')}
        columns={columns}
        rows={tasks}
        rowKey={(task) => task.task}
        emptyState={
          query.isLoading ? null : (
            <EmptyState
              className="border-0"
              icon={<Timer className="size-8" aria-hidden="true" />}
              title={t('empty_title')}
              description={t('empty_description')}
            />
          )
        }
      />
    </section>
  );
}
