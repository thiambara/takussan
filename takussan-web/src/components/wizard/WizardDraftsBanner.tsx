'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WizardDraftListResponse } from '@/types/wizard-draft';
import { estDemarcheAReprendre, projectDraftForBanner } from '@/lib/wizard-drafts';

/**
 * TCK-250 — Dashboard banner that surfaces the current user's resumable
 * wizard drafts with a deep-link to each one.
 *
 * Renders nothing when there are no active drafts, so it's safe to drop
 * unconditionally near the top of `/app` overview pages. The list is
 * fetched client-side via the Next proxy so it stays consistent with the
 * autosave round-trip without forcing an SSR refetch on every navigation.
 */
type Props = {
  className?: string;
  /** Initial drafts already loaded server-side (avoid CLS). Optional. */
  initialDrafts?: WizardDraftListResponse['data'];
};

export function WizardDraftsBanner({ className, initialDrafts }: Props) {
  const t = useTranslations('wizardDrafts.banner');
  const [drafts, setDrafts] = useState<WizardDraftListResponse['data']>(initialDrafts ?? []);
  const [loaded, setLoaded] = useState(initialDrafts !== undefined);

  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/me/wizard-drafts', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return;
        const body = (await res.json()) as WizardDraftListResponse | null;
        if (cancelled || !body?.data) return;
        setDrafts(body.data);
      } catch {
        // Silently swallow — the banner is non-critical UI.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  const entries = useMemo(
    // TCK-566 — un brouillon sans aucune saisie n'est pas « 1 démarche en cours ».
    () =>
      drafts
        .filter(estDemarcheAReprendre)
        .map(projectDraftForBanner)
        .filter((entry) => entry.resumeHref !== null),
    [drafts],
  );

  if (entries.length === 0) return null;

  return (
    <aside
      role="region"
      aria-label={t('ariaLabel')}
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-foreground sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
        >
          <Sparkles className="size-4" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="font-display text-base font-semibold text-foreground">{t('title')}</p>
          <p className="text-sm text-muted-foreground">
            {t('description', { count: entries.length })}
          </p>
        </div>
      </div>

      <ul className="flex flex-wrap gap-2 sm:justify-end">
        {entries.map((entry) => {
          const label = entry.i18nKey
            ? t(`labels.${entry.i18nKey}` as 'labels.host-individual-wizard')
            : entry.key;
          return (
            <li key={entry.key}>
              <Link
                href={entry.resumeHref ?? '#'}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-[background-color,scale] duration-150 ease-out hover:bg-[var(--primary-deep)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]"
              >
                {label}
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
