'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Loader2, X } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, apiRequest, buildQueryString } from '@/lib/api';
import {
  createCustomerTask,
  fetchCustomerTasks,
  updateTask,
} from '@/lib/queries/pipeline';
import {
  createCustomerNote,
  fetchCustomerNotes,
  fetchDashboardCustomer,
} from '@/lib/queries/customers';
import { PIPELINE_QUERY_KEY } from '@/hooks/pipelineKeys';
import type { Task } from '@/types/pipeline';

interface CustomerDetailSheetProps {
  customerId: number;
  onOpenChange: (open: boolean) => void;
}

interface ActivityRow {
  id: number;
  description: string;
  log_name?: string;
  created_at: string;
  causer?: { id: number; name?: string } | null;
  changes?: { attributes?: Record<string, unknown>; old?: Record<string, unknown> } | null;
}

async function fetchCustomerActivity(token: string, customerId: number): Promise<ActivityRow[]> {
  // Audit log endpoint already exposed in TCK-079 era — query scoped to
  // subject. This intentionally degrades to [] on 404 so the tab still
  // renders for environments where the audit endpoint isn't enabled.
  const qs = buildQueryString({
    filter: { subject_type: 'App\\Models\\Customer', subject_id: customerId },
    sort: '-created_at',
    per_page: 30,
  });
  try {
    const res = await apiRequest<{ data: ActivityRow[] }>(`/api/audit-log${qs ? `?${qs}` : ''}`, {
      token,
    });
    return res.data ?? [];
  } catch {
    return [];
  }
}

export function CustomerDetailSheet({ customerId, onOpenChange }: CustomerDetailSheetProps) {
  const t = useTranslations('crm.pipeline');
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'overview' | 'notes' | 'tasks' | 'activity'>('overview');

  const customerQuery = useQuery({
    queryKey: ['customer', customerId, 'detail'],
    queryFn: () => (token ? fetchDashboardCustomer(token, customerId) : Promise.resolve(null)),
    enabled: !!token,
  });

  const notesQuery = useQuery({
    queryKey: PIPELINE_QUERY_KEY.customerNotes(customerId),
    queryFn: () => (token ? fetchCustomerNotes(token, customerId) : Promise.resolve([])),
    enabled: !!token && tab === 'notes',
  });

  const tasksQuery = useQuery({
    queryKey: PIPELINE_QUERY_KEY.customerTasks(customerId),
    queryFn: () => (token ? fetchCustomerTasks(token, customerId) : Promise.resolve([])),
    enabled: !!token && (tab === 'tasks' || tab === 'overview'),
  });

  const activityQuery = useQuery({
    queryKey: ['customer', customerId, 'activity'],
    queryFn: () => (token ? fetchCustomerActivity(token, customerId) : Promise.resolve([])),
    enabled: !!token && tab === 'activity',
  });

  const noteMutation = useMutation<unknown, ApiError, string>({
    mutationFn: async (body) => {
      if (!token) throw new ApiError(401, { message: 'unauth' });
      return createCustomerNote(token, customerId, body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PIPELINE_QUERY_KEY.customerNotes(customerId) });
    },
  });

  const taskMutation = useMutation<Task, ApiError, { title: string; due_at?: string }>({
    mutationFn: async (payload) => {
      if (!token) throw new ApiError(401, { message: 'unauth' });
      return createCustomerTask(token, customerId, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: PIPELINE_QUERY_KEY.customerTasks(customerId),
      });
    },
  });

  const taskStatusMutation = useMutation<
    Task,
    ApiError,
    { id: number; status: 'open' | 'in_progress' | 'done' | 'cancelled' }
  >({
    mutationFn: async ({ id, status }) => {
      if (!token) throw new ApiError(401, { message: 'unauth' });
      return updateTask(token, id, { status });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: PIPELINE_QUERY_KEY.customerTasks(customerId),
      });
    },
  });

  const customer = customerQuery.data;

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-md border-l border-app-surface-2 sm:max-w-lg"
        data-testid="customer-detail-sheet"
      >
        <header className="flex items-start justify-between gap-3 border-b border-app-surface-2 p-4">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-app-ink">
              {customer ? `${customer.first_name} ${customer.last_name}` : '…'}
            </p>
            {customer?.email ? (
              <p className="truncate text-xs text-app-ink-muted">{customer.email}</p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            aria-label={t('actions.close')}
          >
            <X className="size-4" />
          </Button>
        </header>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex-1 overflow-hidden">
          <TabsList className="m-3 flex">
            <TabsTrigger value="overview">{t('tabs.overview')}</TabsTrigger>
            <TabsTrigger value="notes">{t('tabs.notes')}</TabsTrigger>
            <TabsTrigger value="tasks">{t('tabs.tasks')}</TabsTrigger>
            <TabsTrigger value="activity">{t('tabs.activity')}</TabsTrigger>
          </TabsList>

          <div className="overflow-y-auto px-4 pb-4">
            <TabsContent value="overview">
              {customerQuery.isLoading ? (
                <Loading />
              ) : customer ? (
                <dl className="space-y-3 text-sm">
                  <Field label={t('fields.phone')} value={customer.phone} />
                  <Field label={t('fields.email')} value={customer.email} />
                  <Field label={t('fields.occupation')} value={customer.occupation} />
                  <Field label={t('fields.stage')} value={t(`stage.${customer.pipeline_stage ?? 'lead'}`)} />
                  <Field
                    label={t('fields.tasksCount')}
                    value={String((tasksQuery.data ?? []).filter((t) => t.status !== 'done' && t.status !== 'cancelled').length)}
                  />
                </dl>
              ) : (
                <Empty />
              )}
            </TabsContent>

            <TabsContent value="notes">
              <NotesTab
                notes={notesQuery.data ?? []}
                isLoading={notesQuery.isLoading}
                onAdd={(body) => noteMutation.mutate(body)}
                isAdding={noteMutation.isPending}
              />
            </TabsContent>

            <TabsContent value="tasks">
              <TasksTab
                tasks={tasksQuery.data ?? []}
                isLoading={tasksQuery.isLoading}
                onAdd={(payload) => taskMutation.mutate(payload)}
                isAdding={taskMutation.isPending}
                onToggleStatus={(task) =>
                  taskStatusMutation.mutate({
                    id: task.id,
                    status: task.status === 'done' ? 'open' : 'done',
                  })
                }
              />
            </TabsContent>

            <TabsContent value="activity">
              <ActivityTab rows={activityQuery.data ?? []} isLoading={activityQuery.isLoading} />
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-app-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-app-ink">{value ?? '—'}</dd>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-8 text-app-ink-muted">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}

function Empty() {
  const t = useTranslations('crm.pipeline');
  return <p className="py-8 text-center text-sm text-app-ink-muted">{t('empty')}</p>;
}

interface NotesTabProps {
  notes: Array<{ id: number; body: string; pinned: boolean; created_at: string }>;
  isLoading: boolean;
  onAdd: (body: string) => void;
  isAdding: boolean;
}

function NotesTab({ notes, isLoading, onAdd, isAdding }: NotesTabProps) {
  const t = useTranslations('crm.pipeline');
  const [body, setBody] = useState('');

  return (
    <div className="space-y-4">
      <div>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder={t('notes.placeholder')}
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            disabled={body.trim().length === 0 || isAdding}
            onClick={() => {
              onAdd(body.trim());
              setBody('');
            }}
          >
            {t('notes.add')}
          </Button>
        </div>
      </div>
      {isLoading ? (
        <Loading />
      ) : notes.length === 0 ? (
        <Empty />
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li
              key={n.id}
              className="rounded-md border border-app-surface-2 bg-app-surface-1 p-3 text-sm"
            >
              {n.pinned ? (
                <span className="mb-1 inline-block rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                  {t('notes.pinned')}
                </span>
              ) : null}
              <p className="whitespace-pre-wrap text-app-ink">{n.body}</p>
              <time className="mt-1 block text-xs text-app-ink-muted">
                {new Date(n.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface TasksTabProps {
  tasks: Task[];
  isLoading: boolean;
  onAdd: (payload: { title: string; due_at?: string }) => void;
  isAdding: boolean;
  onToggleStatus: (task: Task) => void;
}

function TasksTab({ tasks, isLoading, onAdd, isAdding, onToggleStatus }: TasksTabProps) {
  const t = useTranslations('crm.pipeline');
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('tasks.titlePlaceholder')}
        />
        <DateTimePicker
          value={due}
          onValueChange={setDue}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={title.trim().length === 0 || isAdding}
            onClick={() => {
              onAdd({
                title: title.trim(),
                due_at: due ? new Date(due).toISOString() : undefined,
              });
              setTitle('');
              setDue('');
            }}
          >
            {t('tasks.add')}
          </Button>
        </div>
      </div>
      {isLoading ? (
        <Loading />
      ) : tasks.length === 0 ? (
        <Empty />
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex items-start gap-3 rounded-md border border-app-surface-2 bg-app-surface-1 p-3 text-sm"
            >
              <input
                type="checkbox"
                className="mt-1 size-4 cursor-pointer accent-primary"
                checked={task.status === 'done'}
                onChange={() => onToggleStatus(task)}
                aria-label={t('tasks.toggle')}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={
                    task.status === 'done'
                      ? 'text-app-ink-muted line-through'
                      : 'text-app-ink'
                  }
                >
                  {task.title}
                </p>
                {task.due_at ? (
                  <time className="block text-xs text-app-ink-muted">
                    {new Date(task.due_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
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

function ActivityTab({ rows, isLoading }: { rows: ActivityRow[]; isLoading: boolean }) {
  if (isLoading) return <Loading />;
  if (rows.length === 0) return <Empty />;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li
          key={r.id}
          className="rounded-md border border-app-surface-2 bg-app-surface-1 p-3 text-sm"
        >
          <p className="text-app-ink">{r.description}</p>
          <time className="block text-xs text-app-ink-muted">
            {new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </time>
        </li>
      ))}
    </ul>
  );
}
