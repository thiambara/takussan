'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Timer } from 'lucide-react';
import { DataTable, StatusBadge, type DataTableColumn, type StatusTone } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { fetchScheduler } from '@/lib/queries/super-admin';
import type { ScheduledTask } from '@/types/super-admin';

/**
 * TCK-383 — le TON de chaque issue, et le repli qui compte autant que les quatre autres.
 *
 * Un statut inconnu (ligne écrite avant que le vocabulaire existe, ou statut ajouté côté API sans
 * que cet écran le sache) tombe en `neutral` et affiche sa valeur BRUTE. Le remplacer par « — »
 * effacerait l'information au lieu de l'avouer : c'est exactement le geste qui a fait passer
 * `finished` pour une mesure pendant trois mois.
 */
const TONS: Record<string, StatusTone> = {
  finished: 'success',
  failed: 'danger',
  skipped: 'neutral',
  running: 'info',
};

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
      id: 'status',
      header: t('colStatus'),
      cell: (task) =>
        task.last_status ? (
          <StatusBadge
            label={t.has(`status.${task.last_status}`) ? t(`status.${task.last_status}`) : task.last_status}
            tone={TONS[task.last_status] ?? 'neutral'}
            data-testid="scheduler-status"
          />
        ) : (
          <span className="text-muted-foreground">{t('statusUnknown')}</span>
        ),
    },
    {
      id: 'avgDuration',
      header: t('colAvgDuration'),
      className: 'text-muted-foreground',
      // `!== null` et non la véracité : une tâche mesurée à 0 ms rendait « — », c'est-à-dire
      // « jamais mesurée ». Le tiret dit l'ABSENCE de mesure, et rien d'autre.
      cell: (task) => (task.average_duration_ms !== null ? `${task.average_duration_ms}ms` : '—'),
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
