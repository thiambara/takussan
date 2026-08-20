'use client';

import Link from 'next/link';
import { Sparkles, Clock3 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

interface ProUpgradeCardProps {
  pending?: boolean;
  onNavigate?: () => void;
}

const UPGRADE_HREF = '/app/settings/agency/upgrade';

export function ProUpgradeCard({ pending = false, onNavigate }: ProUpgradeCardProps) {
  const t = useTranslations('nav.proUpgrade');
  const Icon = pending ? Clock3 : Sparkles;
  const title = pending ? t('pendingTitle') : t('title');
  const body = pending ? t('pendingBody') : t('body');
  const cta = pending ? t('pendingCta') : t('cta');

  return (
    <Link
      href={UPGRADE_HREF}
      onClick={onNavigate}
      aria-label={title}
      className={cn(
        'group/upgrade mb-2 block rounded-xl border px-3.5 py-3 transition-colors',
        pending
          ? 'border-app-surface-3 bg-app-surface-2/70 hover:bg-app-surface-2'
          : 'border-app-surface-3 bg-app-surface-2 hover:border-app-accent/30 hover:bg-app-surface-3',
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-lg',
            pending
              ? 'bg-app-surface-1 text-app-ink-muted'
              : 'bg-app-accent/10 text-app-accent',
          )}
        >
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.8rem] font-semibold leading-tight text-app-ink">
            {title}
          </p>
          <p className="mt-0.5 text-[0.7rem] leading-snug text-app-ink-muted">
            {body}
          </p>
          <p
            className={cn(
              'mt-2 inline-flex items-center text-[0.7rem] font-semibold uppercase tracking-wide',
              pending
                ? 'text-app-ink-muted group-hover/upgrade:text-app-ink'
                : 'text-app-accent group-hover/upgrade:text-app-topbar',
            )}
          >
            {cta}
            <span aria-hidden className="ml-1 transition-transform group-hover/upgrade:translate-x-0.5">
              →
            </span>
          </p>
        </div>
      </div>
    </Link>
  );
}
