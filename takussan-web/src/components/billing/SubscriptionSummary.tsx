'use client';

import { useTranslations } from 'next-intl';
import { CreditCard, Gauge, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AgencySubscription } from '@/types/super-admin';

export function SubscriptionSummary({ subscription }: { subscription: AgencySubscription | null }) {
  // Le hook se place AVANT la sortie anticipée : un `useTranslations` posé après serait un hook
  // conditionnel, refusé par le React Compiler (ADR-0015).
  const t = useTranslations('billing.subscription');

  if (!subscription) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">{t('none')}</CardContent>
      </Card>
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
          <Badge variant={subscription.status === 'active' ? 'default' : 'secondary'}>{subscription.status}</Badge>
          <span className="text-sm text-muted-foreground">
            {formatDate(subscription.current_period_start)} → {formatDate(subscription.current_period_end)}
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
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
      </CardContent>
    </Card>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="size-4 text-primary" aria-hidden="true" />
      </div>
      <p className="mt-2 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

/** Le libellé « illimité » arrive de l'appelant : cette fonction vit hors composant (TCK-292). */
function displayLimit(value: number | undefined, unlimitedLabel: string): string {
  return value === undefined ? unlimitedLabel : String(value);
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value));
}
