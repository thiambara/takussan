'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { StatusBadge } from '@/components/console/StatusBadge';
import { cn } from '@/lib/utils';
import type { ServiceProviderAgencyEntry } from '@/lib/service-provider-onboarding';

/**
 * TCK-262 — Welcome panel shown to a Service Provider who is **already
 * onboarded** and just accepted an invitation from a *new* agency.
 *
 * No wizard needed: phone is already verified, KYC/trades/zones/rates
 * already filled in. We list the agencies the SP collaborates with
 * (the new one included) and offer a CTA back to the dashboard.
 */
export type ServiceProviderMultiAgencyWelcomeProps = {
  collaborations: ServiceProviderAgencyEntry[];
  spProfileId: number;
};

export function ServiceProviderMultiAgencyWelcome({
  collaborations,
}: ServiceProviderMultiAgencyWelcomeProps) {
  const t = useTranslations('serviceProviders.multiAgency');

  // The most recently added collaboration is treated as the "newcomer"
  // — the one the SP just accepted. We surface it in the headline so
  // the SP feels welcomed by the right agency.
  const newest = collaborations
    .slice()
    .sort((a, b) => b.collaboration_id - a.collaboration_id)[0];

  return (
    <section
      data-testid="sp-multi-agency-welcome"
      className="rounded-2xl border border-border bg-card p-5 sm:p-8"
    >
      {/* `h2` : la coque porte déjà le `h1` de la page — deux `h1` se disputaient le titre. */}
      <header className="mb-6">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-balance text-foreground sm:text-3xl">
          {newest
            ? t('welcomeAgency', { agency: newest.agency.name })
            : t('welcomeGeneric')}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground">
          {t('subtitle', { count: collaborations.length })}
        </p>
      </header>

      <ul className="mb-6 divide-y divide-border rounded-xl border border-border">
        {collaborations.map((c) => (
          <li
            key={c.collaboration_id}
            className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
            data-testid={`sp-multi-agency-row-${c.collaboration_id}`}
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-foreground">
                {c.agency.name}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {c.agency.slug}
              </span>
            </span>
            <StatusBadge
              className="shrink-0"
              tone={c.status === 'active' ? 'success' : 'attention'}
              label={t(`status.${c.status ?? 'unknown'}`)}
            />
          </li>
        ))}
      </ul>

      <div className="flex">
        <Link href="/app" className={cn(buttonVariants(), 'h-11 w-full px-5 sm:w-auto')}>
          {t('cta.dashboard')}
        </Link>
      </div>
    </section>
  );
}
