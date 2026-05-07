'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchScheduler } from '@/lib/queries/super-admin';

export function ScheduledTaskTable() {
  const query = useQuery({
    queryKey: ['super-admin', 'scheduler'],
    queryFn: fetchScheduler,
    refetchInterval: 30_000,
  });

  return (
    <section className="rounded-xl bg-white p-4 ring-1 ring-stone-200">
      <div>
        <h2 className="font-display text-lg font-semibold text-stone-950">Tâches planifiées</h2>
        <p className="text-sm text-stone-600">Dernières exécutions observées par le scheduler Laravel.</p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-stone-200 text-sm">
          <thead className="bg-stone-50 text-left text-xs font-semibold uppercase text-stone-500">
            <tr>
              <th className="px-3 py-2">Tâche</th>
              <th className="px-3 py-2">Dernier run</th>
              <th className="px-3 py-2">Durée moyenne</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {(query.data?.data ?? []).map((task) => (
              <tr key={task.task}>
                <td className="px-3 py-3 font-medium text-stone-950">{task.task}</td>
                <td className="px-3 py-3 text-stone-600">{task.last_run_at ? new Date(task.last_run_at).toLocaleString('fr-FR') : '—'}</td>
                <td className="px-3 py-3 text-stone-600">{task.average_duration_ms ? `${task.average_duration_ms}ms` : '—'}</td>
              </tr>
            ))}
            {!query.isLoading && (query.data?.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-sm text-stone-500">Aucun run capturé.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
