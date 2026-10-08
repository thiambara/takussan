'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListTodo, Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { EmptyState, ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import type { Locale } from '@/i18n/config';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import {
  AGENT_CRM_QUERY_KEY,
  TASK_DUE_FILTERS,
  createTask,
  fetchMyTasks,
  searchTaskables,
  setTaskDone,
} from '@/lib/queries/agent-crm';
import { cn } from '@/lib/utils';
import type { AgentTask, TaskDue, TaskableOption } from '@/types/agent-crm';

import { ContactGestures } from './ContactGestures';

interface MyTasksProps {
  readonly initialDue: TaskDue | null;
}

/**
 * TCK-591 §3 — « Mes tâches » : filtrer par échéance, cocher, créer une tâche sur un client ou un
 * bien. Le filtre vit dans l'URL (`?filter[due]=today`) : c'est par elle que la tuile « Tâches du
 * jour » du tableau de bord agent mène ici.
 */
export function MyTasks({ initialDue }: MyTasksProps) {
  const t = useTranslations('agentCrm.myTasks');
  const locale = useLocale() as Locale;
  const { token } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [due, setDue] = useState<TaskDue | null>(initialDue);

  const query = useInfiniteQuery({
    queryKey: AGENT_CRM_QUERY_KEY.tasks(due ?? 'all'),
    queryFn: ({ pageParam }) => fetchMyTasks(token ?? '', due, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined,
    enabled: !!token,
  });

  const toggle = useMutation<void, ApiError, AgentTask>({
    mutationFn: (task) => setTaskDone(token ?? '', task.id, task.status !== 'done'),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['agent-crm', 'tasks'] }),
  });

  const choose = (next: TaskDue | null) => {
    setDue(next);
    router.replace(next ? `${pathname}?filter[due]=${next}` : pathname, { scroll: false });
  };

  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="space-y-6">
      <div role="group" aria-label={t('filterLabel')} className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {([null, ...TASK_DUE_FILTERS] as const).map((value) => (
          <button
            key={value ?? 'all'}
            type="button"
            aria-pressed={due === value}
            onClick={() => choose(value)}
            className={cn(
              'min-h-11 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors',
              due === value ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {t(`filter.${value ?? 'all'}`)}
          </button>
        ))}
      </div>

      <NewTaskForm onCreated={() => void queryClient.invalidateQueries({ queryKey: ['agent-crm', 'tasks'] })} />

      {toggle.error ? (
        <p role="alert" className="text-sm text-destructive">{toggle.error.proseServeur ?? t('toggleFailed')}</p>
      ) : null}

      {query.isPending ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        </div>
      ) : query.isError ? (
        <ErrorState message={t('loadFailed')} onRetry={() => void query.refetch()} retryLabel={t('retry')} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<ListTodo className="size-8" aria-hidden="true" />} title={t(`empty.${due ?? 'all'}`)} />
      ) : (
        <ul className="space-y-2" data-testid="my-tasks">
          {rows.map((task) => (
            <li key={task.id} className="flex items-start gap-3 rounded-xl bg-card p-3 text-sm">
              <label className="-m-1 flex size-11 shrink-0 cursor-pointer items-center justify-center">
                <input
                  type="checkbox"
                  className="size-5 cursor-pointer accent-primary"
                  checked={task.status === 'done'}
                  disabled={toggle.isPending}
                  onChange={() => toggle.mutate(task)}
                  aria-label={t('toggle', { title: task.title })}
                />
              </label>
              <div className="min-w-0 flex-1 space-y-1">
                <p className={task.status === 'done' ? 'text-muted-foreground line-through' : 'font-medium text-foreground'}>
                  {task.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {task.due_at ? (
                    <time className="tabular-nums">{formatDateTime(task.due_at, locale)}</time>
                  ) : (
                    t('noDue')
                  )}
                  {task.taskable ? (
                    <>
                      {' · '}
                      <Link
                        href={task.taskable.type === 'customer' ? `/app/customers/${task.taskable.id}` : `/app/properties/${task.taskable.id}`}
                        className="underline underline-offset-2"
                      >
                        {task.taskable.label ?? t(`hidden.${task.taskable.type}`)}
                      </Link>
                    </>
                  ) : null}
                </p>
                {task.taskable?.type === 'customer' && task.taskable.label ? (
                  <ContactGestures
                    compact
                    phone={task.taskable.phone}
                    firstName={task.taskable.label.split(' ')[0] ?? task.taskable.label}
                    fullName={task.taskable.label}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {query.hasNextPage ? (
        <div className="flex justify-center">
          <Button type="button" variant="outline" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
            {t('loadMore')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function NewTaskForm({ onCreated }: { readonly onCreated: () => void }) {
  const t = useTranslations('agentCrm.myTasks.create');
  const { token } = useAuth();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [type, setType] = useState<'customer' | 'property'>('customer');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [target, setTarget] = useState<TaskableOption | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const options = useQuery({
    queryKey: AGENT_CRM_QUERY_KEY.taskables(type, debounced),
    queryFn: () => searchTaskables(token ?? '', type, debounced),
    enabled: !!token && debounced.length >= 2 && target === null,
    staleTime: 30_000,
  });

  const create = useMutation<AgentTask, ApiError, void>({
    mutationFn: () =>
      createTask(token ?? '', {
        title: title.trim(),
        due_at: due ? new Date(due).toISOString() : undefined,
        taskable: { type, id: target?.id ?? 0 },
      }),
    onSuccess: () => {
      setTitle('');
      setDue('');
      setTarget(null);
      setSearch('');
      onCreated();
    },
  });

  return (
    <form
      className="space-y-3 rounded-xl bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim() && target) create.mutate();
      }}
    >
      <h2 className="font-display text-base font-semibold text-foreground">{t('title')}</h2>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('taskTitle')} aria-label={t('taskTitle')} />
      <DateTimePicker value={due} onValueChange={setDue} />
      <div role="radiogroup" aria-label={t('attachTo')} className="flex gap-2">
        {(['customer', 'property'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={type === value}
            onClick={() => {
              setType(value);
              setTarget(null);
            }}
            className={cn(
              'min-h-11 rounded-lg border px-3 text-sm',
              type === value ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground',
            )}
          >
            {t(`type.${value}`)}
          </button>
        ))}
      </div>
      {target ? (
        <p className="flex items-center justify-between gap-2 text-sm">
          <span>{target.label}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setTarget(null)}>{t('change')}</Button>
        </p>
      ) : (
        <div className="space-y-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t(`search.${type}`)}
            aria-label={t(`search.${type}`)}
          />
          {(options.data ?? []).length > 0 ? (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {(options.data ?? []).map((o) => (
                <li key={o.id}>
                  <button type="button" className="min-h-11 w-full px-3 text-left text-sm hover:bg-muted" onClick={() => setTarget(o)}>
                    {o.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
      {create.error ? (
        <p role="alert" className="text-sm text-destructive">{create.error.proseServeur ?? t('failed')}</p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={!title.trim() || !target || create.isPending}>{t('submit')}</Button>
      </div>
    </form>
  );
}
