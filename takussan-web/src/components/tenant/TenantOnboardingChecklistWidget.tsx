'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronRight, Circle, Loader2 } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { useCompleteOnboardingItem, useTenantOnboardingChecklist } from '@/lib/queries/tenant-onboarding';
import type { TenantOnboardingChecklist, TenantOnboardingChecklistItem } from '@/types/tenant-onboarding';
import { cn } from '@/lib/utils';

/**
 * TCK-266 — "Bienvenue chez vous" checklist surfaced on the tenant
 * dashboard.
 *
 * Hidden when:
 *  - the user has no active lease,
 *  - or every active lease has its checklist completed
 *    (`completed_at !== null`).
 *
 * The widget fetches the lease ids client-side (the dashboard root is a
 * server component but this banner needs the auth-bound tenant context to
 * render correctly). It then drills into each lease's checklist via the
 * dedicated `/api/me/leases/{id}/onboarding-checklist` endpoint — N+1 is
 * fine here since a tenant rarely has more than 1-2 active leases.
 */

type LeaseSummary = { id: number; reference_number: string | null };

const ITEM_ORDER: TenantOnboardingChecklistItem[] = [
  'welcome_seen',
  'inventory_completed',
  'first_payment',
  'documents_acknowledged',
];

function isItemDone(checklist: TenantOnboardingChecklist, item: TenantOnboardingChecklistItem): boolean {
  switch (item) {
    case 'welcome_seen':
      return checklist.welcome_seen_at !== null;
    case 'inventory_completed':
      return checklist.inventory_completed_at !== null;
    case 'first_payment':
      return checklist.first_payment_at !== null;
    case 'documents_acknowledged':
      return checklist.documents_acknowledged_at !== null;
  }
}

export function TenantOnboardingChecklistWidget() {
  const { user } = useAuth();
  const isAuthenticated = user !== null;
  const [activeLeases, setActiveLeases] = useState<LeaseSummary[]>([]);
  const [loadedLeases, setLoadedLeases] = useState(false);

  // Fetch active leases for the current user once. Same proxy URL the
  // welcome wizard uses — sparse fieldset to keep the payload tiny.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          '/api/leases?filter[status]=active&fields[leases]=id,reference_number&per_page=20',
          {
            method: 'GET',
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
          },
        );
        if (cancelled || !res.ok) return;
        const body = (await res.json()) as { data?: Array<{ id: number; reference_number: string | null }> };
        const next = (body?.data ?? []).map((l) => ({
          id: l.id,
          reference_number: l.reference_number ?? null,
        }));
        if (!cancelled) setActiveLeases(next);
      } catch {
        // silent — widget is non-critical
      } finally {
        if (!cancelled) setLoadedLeases(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  if (!loadedLeases || activeLeases.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {activeLeases.map((lease) => (
        <TenantOnboardingChecklistCard key={lease.id} lease={lease} />
      ))}
    </div>
  );
}

function TenantOnboardingChecklistCard({ lease }: { lease: LeaseSummary }) {
  const t = useTranslations('tenant.onboarding');
  const query = useTenantOnboardingChecklist(lease.id);
  const mutation = useCompleteOnboardingItem(lease.id);

  const checklist = query.data?.data ?? null;

  // Always-stable item rows so React doesn't reorder on each render.
  const rows = useMemo(() => ITEM_ORDER, []);

  // Hide the card entirely when the checklist is closed — that's the
  // "widget disappears at completion" behaviour from the ticket.
  if (query.isLoading) {
    return (
      <div
        className="rounded-xl border border-border bg-card p-6"
        aria-busy="true"
      >
        <div className="h-4 w-32 animate-pulse rounded bg-border" />
      </div>
    );
  }

  if (!checklist || checklist.completed_at !== null) {
    return null;
  }

  const handleClickItem = (item: TenantOnboardingChecklistItem): string | null => {
    switch (item) {
      case 'inventory_completed':
        // TCK-379 — le paramètre s'appelle `lease`, PAS `lease_id`. Cette ligne était le SEUL
        // chemin entrant de `/app/inventories/new` dans tout le front, et elle n'y arrivait
        // pas : la page lit `searchParams.lease`, donc le locataire tombait sur l'écran
        // « aucun bail sélectionné » au lieu du formulaire. Mesuré le 2026-08-27 — le ticket,
        // lui, décrivait ce chemin comme fonctionnel.
        return `/app/inventories/new?lease=${lease.id}`;
      case 'first_payment':
        return `/app/payments/new?lease_id=${lease.id}`;
      // welcome_seen is owned by the modal hook ; documents_acknowledged is
      // a direct POST handled below.
      default:
        return null;
    }
  };

  const reference = lease.reference_number ?? `#${lease.id}`;

  return (
    <section
      className="rounded-xl border border-border bg-card p-6"
      aria-labelledby={`tenant-onboarding-${lease.id}`}
    >
      <header className="mb-4">
        <h2 id={`tenant-onboarding-${lease.id}`} className="font-display text-lg font-semibold">
          {t('widget.title', { reference })}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('widget.subtitle')}</p>
      </header>

      <ul className="divide-y divide-border">
        {rows.map((item) => {
          const done = isItemDone(checklist, item);
          const href = handleClickItem(item);
          const isAcknowledge = item === 'documents_acknowledged';

          return (
            <li key={item}>
              <ChecklistRow
                item={item}
                done={done}
                href={href}
                isPending={mutation.isPending && isAcknowledge}
                onAcknowledge={
                  isAcknowledge && !done
                    ? () => mutation.mutate({ item: 'documents_acknowledged' })
                    : undefined
                }
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ChecklistRow({
  item,
  done,
  href,
  onAcknowledge,
  isPending,
}: {
  item: TenantOnboardingChecklistItem;
  done: boolean;
  href: string | null;
  onAcknowledge?: () => void;
  isPending: boolean;
}) {
  const t = useTranslations('tenant.onboarding.items');

  const content = (
    <div className="flex w-full items-center gap-3 py-3 text-left">
      <span
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
          done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-border text-muted-foreground',
        )}
        aria-hidden="true"
      >
        {done ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3 w-3" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-medium', done && 'text-muted-foreground line-through')}>
          {t(`${item}.title`)}
        </p>
        <p className="text-xs text-muted-foreground">{t(`${item}.description`)}</p>
      </div>
      {!done && href ? <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> : null}
      {!done && onAcknowledge ? (
        isPending ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        )
      ) : null}
    </div>
  );

  if (done) {
    return content;
  }

  if (href) {
    return (
      <Link href={href} className="block hover:bg-muted/50">
        {content}
      </Link>
    );
  }

  if (onAcknowledge) {
    return (
      <button
        type="button"
        onClick={onAcknowledge}
        disabled={isPending}
        className="block w-full hover:bg-muted/50 disabled:opacity-60"
      >
        {content}
      </button>
    );
  }

  // welcome_seen with no action: just render the row inert.
  return content;
}
