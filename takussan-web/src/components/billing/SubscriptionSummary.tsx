'use client';

import { CreditCard, Gauge, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AgencySubscription } from '@/types/super-admin';

export function SubscriptionSummary({ subscription }: { subscription: AgencySubscription | null }) {
  if (!subscription) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Aucun abonnement actif.</CardContent>
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
          <Metric icon={ShieldCheck} label="Commission plateforme" value={`${subscription.effective_platform_fee_pct}%`} />
          <Metric icon={Gauge} label="Biens actifs" value={displayLimit(subscription.effective_limits.max_active_listings)} />
          <Metric icon={Gauge} label="Agents" value={displayLimit(subscription.effective_limits.max_agents)} />
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

function displayLimit(value?: number): string {
  return value === undefined ? 'Illimité' : String(value);
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value));
}
