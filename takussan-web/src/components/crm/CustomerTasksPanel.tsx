'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListTodo, Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { EmptyState, ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { PIPELINE_QUERY_KEY } from '@/hooks/pipelineKeys';
import type { Locale } from '@/i18n/config';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { createCustomerTask, fetchCustomerTasks, updateTask } from '@/lib/queries/pipeline';
import type { Task } from '@/types/pipeline';

interface CustomerTasksPanelProps {
  readonly customerId: number;
}

/**
 * TCK-591 §4 — les tâches d'un client, une seule implémentation pour le tiroir du pipeline et la
 * fiche complète (le tiroir en est la vue réduite). Même clé de cache que le compteur de l'aperçu :
 * cocher une tâche ici le met à jour là.
 */
export function CustomerTasksPanel({ customerId }: CustomerTasksPanelProps) {
  const t = useTranslations('crm.pipeline');
  const tCrm = useTranslations('agentCrm.tasks');
  const locale = useLocale() as Locale;
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');

  const tasksQuery = useQuery({
    queryKey: PIPELINE_QUERY_KEY.customerTasks(customerId),
    queryFn: () => fetchCustomerTasks(token ?? '', customerId),
    enabled: !!token,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: PIPELINE_QUERY_KEY.customerTasks(customerId) });

  const create = useMutation<Task, ApiError, { title: string; due_at?: string }>({
    mutationFn: (payload) => createCustomerTask(token ?? '', customerId, payload),
    onSuccess: () => {
      setTitle('');
      setDue('');
      void refresh();
    },
  });
  const toggle = useMutation<Task, ApiError, Task>({
    mutationFn: (task) => updateTask(token ?? '', task.id, { status: task.status === 'done' ? 'open' : 'done' }),
    onSuccess: () => void refresh(),
  });

  const tasks = tasksQuery.data ?? [];
  const failure = create.error ?? toggle.error;

  return (
    <div className="space-y-4">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim().length === 0) return;
          create.mutate({ title: title.trim(), due_at: due ? new Date(due).toISOString() : undefined });
        }}
      >
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('tasks.titlePlaceholder')}
          aria-label={t('tasks.titlePlaceholder')}
        />
        <DateTimePicker value={due} onValueChange={setDue} />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={title.trim().length === 0 || create.isPending}>
            {t('tasks.add')}
          </Button>
        </div>
      </form>

      {failure ? (
        <p role="alert" className="text-sm text-destructive">
          {failure.proseServeur ?? tCrm('saveFailed')}
        </p>
      ) : null}

      {tasksQuery.isPending ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        </div>
      ) : tasksQuery.isError ? (
        <ErrorState message={tCrm('loadFailed')} onRetry={() => void tasksQuery.refetch()} retryLabel={tCrm('retry')} />
      ) : tasks.length === 0 ? (
        <EmptyState icon={<ListTodo className="size-8" aria-hidden="true" />} title={tCrm('empty')} />
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-start gap-3 rounded-lg border border-muted bg-card p-3 text-sm">
              {/* Cible de 44 px : la case se coche au pouce, sur l'écran de 360 px (AC15). */}
              <label className="-m-3 flex size-11 shrink-0 cursor-pointer items-center justify-center">
                <input
                  type="checkbox"
                  className="size-5 cursor-pointer accent-primary"
                  checked={task.status === 'done'}
                  onChange={() => toggle.mutate(task)}
                  disabled={toggle.isPending}
                  aria-label={tCrm('toggle', { title: task.title })}
                />
              </label>
              <div className="min-w-0 flex-1">
                <p className={task.status === 'done' ? 'text-muted-foreground line-through' : 'text-foreground'}>
                  {task.title}
                </p>
                {task.due_at ? (
                  <time className="block text-xs tabular-nums text-muted-foreground">
                    {formatDate(task.due_at, locale, { dateStyle: 'long' })}
                  </time>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
