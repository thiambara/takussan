'use client';

import { useTranslations } from 'next-intl';
import { CreditCard, Gauge, ShieldCheck } from 'lucide-react';
import { StatusBadge, type StatusTone } from '@/components/console/StatusBadge';
import { EmptyState } from '@/components/feedback';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { AgencySubscription } from '@/types/super-admin';

/**
 * Le ton de chaque statut d'abonnement. Le libellé vit sous `billing.subscription.status.*` :
 * l'écran affichait jusqu'ici la valeur d'enum brute (`past_due`) dans une pastille primaire.
 */
const STATUS_TONE: Record<AgencySubscription['status'], StatusTone> = {
  trialing: 'info',
  active: 'success',
  past_due: 'attention',
  suspended: 'danger',
  ended: 'neutral',
};

/**
 * `showOverrides` (TCK-2222, P214.01) : la console du super-admin liste les dérogations actives de
 * l'abonnement, que les valeurs effectives seules ne distinguent pas de celles du plan. L'écran de
 * facturation de l'agence ne les montre pas.
 */
export function SubscriptionSummary({
  subscription,
  showOverrides = false,
}: {
  readonly subscription: AgencySubscription | null;
  readonly showOverrides?: boolean;
}) {
  // Le hook se place AVANT la sortie anticipée : un `useTranslations` posé après serait un hook
  // conditionnel, refusé par le React Compiler (ADR-0015).
  const t = useTranslations('billing.subscription');
  const fmt = useFormatteurs();

  if (!subscription) {
    return (
      <EmptyState
        icon={<CreditCard className="size-8" aria-hidden="true" />}
        title={t('none')}
        description={t('noneDescription')}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="size-5 text-primary" aria-hidden="true" />
          {subscription.plan?.label ?? `Plan #${subscription.plan_id}`}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            label={t.has(`status.${subscription.status}`) ? t(`status.${subscription.status}`) : subscription.status}
            tone={STATUS_TONE[subscription.status] ?? 'neutral'}
          />
          <span className="text-sm tabular-nums text-muted-foreground">
            {fmt.date(subscription.current_period_start)} → {fmt.date(subscription.current_period_end)}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
          <Metric icon={ShieldCheck} label={t('platformFee')} value={`${subscription.effective_platform_fee_pct}%`} />
          <Metric
            icon={Gauge}
            label={t('activeListings')}
            value={displayLimit(subscription.effective_limits.max_active_listings, t('unlimited'))}
          />
          <Metric
            icon={Gauge}
            label={t('agents')}
            value={displayLimit(subscription.effective_limits.max_agents, t('unlimited'))}
          />
        </div>
        {showOverrides && <ActiveOverrides subscription={subscription} />}
      </CardContent>
    </Card>
  );
}

function ActiveOverrides({ subscription }: { readonly subscription: AgencySubscription }) {
  const t = useTranslations('billing.subscription');
  const limits = subscription.limits_override ?? {};
  const items: { label: string; value: string }[] = [];
  if (subscription.platform_fee_pct_override !== null) {
    items.push({ label: t('platformFee'), value: `${subscription.platform_fee_pct_override}%` });
  }
  const libelles = { max_active_listings: t('activeListings'), max_agents: t('agents'), max_branches: t('branches') };
  for (const [cle, label] of Object.entries(libelles)) {
    const value = limits[cle];
    if (value !== undefined && value !== null) items.push({ label, value: String(value) });
  }

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p id={`derogations-${subscription.id}`} className="text-sm font-medium text-foreground">{t('overrides.title')}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('overrides.none')}</p>
      ) : (
        <ul aria-labelledby={`derogations-${subscription.id}`} className="space-y-1 text-sm tabular-nums text-foreground">
          {items.map((item) => (
            <li key={item.label}>{t('overrides.item', { label: item.label, value: item.value })}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="size-4 text-primary" aria-hidden="true" />
      </div>
      <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

/** Le libellé « illimité » arrive de l'appelant : cette fonction vit hors composant (TCK-292). */
function displayLimit(value: number | undefined, unlimitedLabel: string): string {
  return value === undefined ? unlimitedLabel : String(value);
}
