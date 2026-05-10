'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
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
      className="rounded-2xl border border-border bg-card p-8 shadow-sm"
    >
      <header className="mb-6 text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {newest
            ? t('welcomeAgency', { agency: newest.agency.name })
            : t('welcomeGeneric')}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
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
            <span className="flex flex-col">
              <span className="font-medium text-foreground">
                {c.agency.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {c.agency.slug}
              </span>
            </span>
            <span
              className={
                c.status === 'active'
                  ? 'rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900'
                  : 'rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900'
              }
            >
              {t(`status.${c.status ?? 'unknown'}`)}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex justify-center">
        <Link href="/app" className={buttonVariants()}>
          {t('cta.dashboard')}
        </Link>
      </div>
    </section>
  );
}
