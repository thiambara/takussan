'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useLeaseChain } from '@/lib/queries/leases';

interface LeaseChainTimelineProps {
  readonly leaseId: number;
  readonly currentId: number;
}

/**
 * TCK-089 — Frise horizontale "racine → avenant 1 → … → courant".
 * Affiché uniquement quand la chaîne contient au moins 2 baux ; un bail
 * isolé n'a pas besoin de timeline.
 */
export function LeaseChainTimeline({ leaseId, currentId }: LeaseChainTimelineProps) {
  const t = useTranslations('lease.renewal');
  const { data, isLoading } = useLeaseChain(leaseId);
  const chain = data?.data ?? [];

  if (isLoading) {
    return <div className="h-16 animate-pulse rounded-xl bg-app-surface-1" />;
  }

  if (chain.length < 2) {
    return null;
  }

  return (
    <section
      aria-label={t('timeline_title')}
      className="rounded-xl border border-stone-200 bg-white p-4"
    >
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500">
        {t('timeline_title')}
      </h3>
      <ol className="flex flex-wrap items-center gap-2">
        {chain.map((lease, idx) => {
          const isCurrent = lease.id === currentId;
          const label =
            idx === 0
              ? t('timeline_root')
              : t('timeline_amendment', { n: idx });
          return (
            <li key={lease.id} className="flex items-center gap-2">
              <Link
                href={`/app/leases/${lease.id}`}
                aria-current={isCurrent ? 'true' : undefined}
                className={`flex flex-col rounded-md border px-3 py-2 text-xs transition ${
                  isCurrent
                    ? 'border-stone-900 bg-stone-900 text-white'
                    : 'border-stone-200 bg-stone-50 text-stone-700 hover:border-stone-400'
                }`}
              >
                <span className="font-semibold">{label}</span>
                <span className="text-[11px] opacity-80">{lease.reference_number}</span>
                {isCurrent && (
                  <span className="mt-1 text-[10px] uppercase tracking-wide">
                    {t('timeline_current')}
                  </span>
                )}
              </Link>
              {idx < chain.length - 1 && (
                <span aria-hidden className="text-stone-400">
                  →
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
