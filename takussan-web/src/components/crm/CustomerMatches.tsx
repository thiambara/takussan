'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Home, Loader2, MessageCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { EmptyState, ErrorState } from '@/components/feedback';
import { buttonVariants } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import type { Locale } from '@/i18n/config';
import { formatCurrency } from '@/lib/format';
import { AGENT_CRM_QUERY_KEY, fetchMatchingProperties } from '@/lib/queries/agent-crm';
import { cn } from '@/lib/utils';

import { isReachable, whatsappHref } from './contact';

interface CustomerMatchesProps {
  readonly customerId: number;
  readonly firstName: string;
  readonly phone: string | null;
}

/**
 * TCK-591 §5 — les biens de l'agence qui répondent aux critères du prospect, et le partage de la
 * sélection par WhatsApp. Seul un bien PUBLIC a un lien à partager : un bien privé reste listé
 * pour l'agent, jamais envoyé.
 */
export function CustomerMatches({ customerId, firstName, phone }: CustomerMatchesProps) {
  const t = useTranslations('agentCrm.matches');
  const locale = useLocale() as Locale;
  const { token } = useAuth();
  const [selected, setSelected] = useState<number[]>([]);

  const query = useQuery({
    queryKey: AGENT_CRM_QUERY_KEY.matchingProperties(customerId),
    queryFn: () => fetchMatchingProperties(token ?? '', customerId),
    enabled: !!token,
  });

  if (query.isPending) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState message={t('loadFailed')} onRetry={() => void query.refetch()} retryLabel={t('retry')} />;
  }

  const rows = query.data.data;
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Home className="size-8" aria-hidden="true" />}
        title={t('empty')}
        description={t('emptyHint')}
      />
    );
  }

  const shareable = rows.filter((p) => p.visibility === 'public' && p.slug);
  const picked = shareable.filter((p) => selected.includes(p.id));
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const message = [
    t('shareIntro', { firstName }),
    ...picked.map((p) => `• ${p.title} — ${origin}/properties/${p.slug}`),
  ].join('\n');

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('count', { count: query.data.meta.total })}</p>
      <ul className="space-y-2">
        {rows.map((p) => {
          const canShare = p.visibility === 'public' && !!p.slug;
          return (
            <li key={p.id} className="flex items-start gap-3 rounded-xl bg-card p-3 text-sm">
              <label className="-m-1 flex size-11 shrink-0 items-center justify-center">
                <input
                  type="checkbox"
                  className="size-5 accent-primary disabled:opacity-40"
                  disabled={!canShare}
                  checked={selected.includes(p.id)}
                  onChange={(e) =>
                    setSelected((cur) => (e.target.checked ? [...cur, p.id] : cur.filter((id) => id !== p.id)))
                  }
                  aria-label={canShare ? t('select', { title: p.title }) : t('notShareable', { title: p.title })}
                />
              </label>
              <div className="min-w-0 flex-1">
                <Link href={`/app/properties/${p.id}`} className="font-semibold text-foreground underline-offset-2 hover:underline">
                  {p.title}
                </Link>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {formatCurrency(Number(p.price), locale)}
                  {p.city ? ` · ${[p.neighborhood, p.city].filter(Boolean).join(', ')}` : ''}
                  {canShare ? '' : ` · ${t('private')}`}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      {isReachable(phone) ? (
        <a
          href={picked.length > 0 ? whatsappHref(phone, message) : undefined}
          aria-disabled={picked.length === 0}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11', picked.length === 0 && 'pointer-events-none opacity-50')}
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          {t('share', { count: picked.length })}
        </a>
      ) : (
        <p className="text-xs text-muted-foreground">{t('noWhatsapp')}</p>
      )}
    </div>
  );
}
