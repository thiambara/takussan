'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ChevronRight, ClipboardCheck, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import {
  SUPER_ADMIN_QUEUES,
  SUPER_ADMIN_QUEUE_ORDER,
  queueCountQueryOptions,
  type SuperAdminQueueKey,
} from '@/lib/queries/super-admin-queues';
import type { ApiError } from '@/lib/api';

/**
 * TCK-360 — ce qui attend le super-admin, en haut de sa console.
 *
 * L'accueil rendait huit nombres sans ordre ni destination. Un nombre sans destination ne se
 * traite pas : il s'observe. Cette section inverse la page — d'abord les quatre files, chacune
 * une LIGNE CLIQUABLE qui mène à la vue où on la traite, ensuite seulement les métriques.
 *
 * ⚠ **Une file vide reste affichée.** C'est la contrainte la moins intuitive du ticket, et la
 * plus utile : masquer la ligne du KYC quand il n'y a rien rendrait « aucun dossier en attente »
 * indiscernable de « le compte n'a pas chargé ». L'absence de dossier est une information ; elle
 * s'écrit.
 */

const QUEUE_ICONS: Record<SuperAdminQueueKey, LucideIcon> = {
  'kyc-pending': ShieldCheck,
  'upgrade-requests-pending': ClipboardCheck,
  'moderation-pending': ShieldAlert,
  'failed-jobs': TriangleAlert,
};

export function ConsoleQueues() {
  const t = useTranslations('superAdmin.queues');

  return (
    <section aria-labelledby="super-admin-queues" className="rounded-xl bg-card ring-1 ring-border">
      <div className="border-b border-border px-5 py-4">
        <h2 id="super-admin-queues" className="font-display text-base font-semibold text-foreground">
          {t('title')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <ul className="divide-y divide-border" data-testid="super-admin-queues">
        {SUPER_ADMIN_QUEUE_ORDER.map((queue) => (
          <QueueRow key={queue} queue={queue} />
        ))}
      </ul>
    </section>
  );
}

function QueueRow({ queue }: { queue: SuperAdminQueueKey }) {
  const t = useTranslations('superAdmin.queues');
  const messageErreur = useMessageErreurApi();
  const Icon = QUEUE_ICONS[queue];
  const { data, isPending, isError, error } = useQuery<number, ApiError>(queueCountQueryOptions(queue));

  return (
    <li>
      <Link
        href={SUPER_ADMIN_QUEUES[queue].href}
        data-testid={`queue-row-${queue}`}
        className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40"
      >
        <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-foreground">{t(`items.${queue}.label`)}</span>
          <span className="block truncate text-sm text-muted-foreground">
            {t(`items.${queue}.description`)}
          </span>
        </span>
        <QueueCount
          queue={queue}
          count={data}
          loading={isPending}
          error={isError ? messageErreur(error, t('countError')) : null}
        />
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}

/**
 * Le compte lui-même — trois états, et le troisième est le point du ticket.
 *
 * `0` ne se rend PAS comme `0` : il se rend comme « rien en attente ». Le chiffre nu laisserait au
 * lecteur le soin de conclure ; le libellé conclut pour lui, et distingue au passage la file vide
 * du compte indisponible, que le même `0` aurait confondus.
 */
function QueueCount({
  queue,
  count,
  loading,
  error,
}: {
  queue: SuperAdminQueueKey;
  count: number | undefined;
  loading: boolean;
  error: string | null;
}) {
  const t = useTranslations('superAdmin.queues');

  if (loading) {
    return <Skeleton className="h-6 w-12 shrink-0" data-testid={`queue-count-loading-${queue}`} />;
  }

  if (error) {
    return (
      <span className="shrink-0 text-sm font-medium text-destructive" data-testid={`queue-count-error-${queue}`}>
        {error}
      </span>
    );
  }

  if (!count) {
    return (
      <span className="shrink-0 text-sm text-muted-foreground" data-testid={`queue-count-${queue}`}>
        {t('empty')}
      </span>
    );
  }

  return (
    <span
      className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-foreground"
      data-testid={`queue-count-${queue}`}
    >
      <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-primary px-2 py-0.5 text-xs tabular-nums text-primary-foreground">
        {count}
      </span>
      {t(`items.${queue}.unit`, { count })}
    </span>
  );
}
