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
          ? 'border-border bg-muted/70 hover:bg-muted'
          : 'border-border bg-muted hover:border-primary/30 hover:bg-border',
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-lg',
            pending
              ? 'bg-card text-muted-foreground'
              : 'bg-primary/10 text-primary',
          )}
        >
          <Icon className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.8rem] font-semibold leading-tight text-foreground">
            {title}
          </p>
          <p className="mt-0.5 text-[0.7rem] leading-snug text-muted-foreground">
            {body}
          </p>
          <p
            className={cn(
              'mt-2 inline-flex items-center text-[0.7rem] font-semibold uppercase tracking-wide',
              pending
                ? 'text-muted-foreground group-hover/upgrade:text-foreground'
                : 'text-primary group-hover/upgrade:text-foreground',
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
