'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  Ban,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  Home,
  ShieldCheck,
  ShieldOff,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchAdminAgencyDetail,
  fetchAdminAgencyHealth,
  fetchAdminAgencyKyc,
  fetchAdminAgencyProperties,
  fetchAdminAgencyTeam,
  postAgencyAction,
} from '@/lib/queries/super-admin';
import { AdminAgencySubscriptionPanel } from '@/components/billing/AdminAgencySubscriptionPanel';
import { KycDossierTimeline, KycReviewPanel } from '@/components/kyc/kyc-components';
import type {
  AdminAgencyDetail,
  AdminAgencyHealth,
  AdminAgencyTeamMember,
  AdminPropertyRow,
  KycDossier,
} from '@/types/super-admin';
import { ConfirmActionDialog } from './ConfirmActionDialog';

type Action = 'verify' | 'suspend' | 'unverify';
type Tab = 'kyc' | 'subscription' | 'team' | 'properties' | 'transactions';

type ActionMeta = { title: string; description: string; phrase: string; label: string; destructive?: boolean };

/**
 * TCK-292 — fabrique plutôt que table figée. Les descriptions diffèrent VOLONTAIREMENT de celles
 * d'`AgencyModerationCard` (deux écrans, deux formulations) : ne pas fusionner les deux jeux.
 * La phrase de confirmation reste un jeton technique — elle est comparée à la frappe.
 */
function actionMeta(t: (key: string) => string): Record<Action, ActionMeta> {
  return {
    verify: {
      title: t('actions.verify.title'),
      description: t('actions.verify.description'),
      phrase: 'VERIFIER',
      label: t('actions.verify.label'),
    },
    suspend: {
      title: t('actions.suspend.title'),
      description: t('actions.suspend.description'),
      phrase: 'SUSPENDRE',
      label: t('actions.suspend.label'),
      destructive: true,
    },
    unverify: {
      title: t('actions.unverify.title'),
      description: t('actions.unverify.description'),
      phrase: 'DEVERIFIER',
      label: t('actions.unverify.label'),
      destructive: true,
    },
  };
}

/** TCK-292 — la donnée porte la CLÉ, le rendu la résout (`superAdmin.agencyStatus.*`). */
const STATUS_KEY: Record<string, string> = {
  active: 'active',
  inactive: 'inactive',
  suspended: 'suspended',
};

export function AgencyDetailPage({ agencyId }: { agencyId: number }) {
  const t = useTranslations('superAdmin.agencyDetail');
  const [activeTab, setActiveTab] = useState<Tab>('kyc');
  const [detailQuery, healthQuery, teamQuery, propertiesQuery, kycQuery] = useQueries({
    queries: [
      {
        queryKey: ['super-admin', 'agency', agencyId],
        queryFn: () => fetchAdminAgencyDetail(agencyId),
      },
      {
        queryKey: ['super-admin', 'agency', agencyId, 'health'],
        queryFn: () => fetchAdminAgencyHealth(agencyId),
      },
      {
        queryKey: ['super-admin', 'agency', agencyId, 'team'],
        queryFn: () => fetchAdminAgencyTeam(agencyId),
      },
      {
        queryKey: ['super-admin', 'agency', agencyId, 'properties'],
        queryFn: () => fetchAdminAgencyProperties(agencyId),
      },
      {
        queryKey: ['super-admin', 'agency', agencyId, 'kyc'],
        queryFn: () => fetchAdminAgencyKyc(agencyId),
      },
    ],
  });

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-36 rounded-xl" />
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">
          {t('loadError')}
        </CardContent>
      </Card>
    );
  }

  const agency = detailQuery.data.data;
  const health = healthQuery.data?.data;

  return (
    <div className="space-y-6">
      <AgencyDetailHeader agency={agency} />
      <AgencyModerationActionsMenu agency={agency} />
      <AgencyHealthStrip health={health} loading={healthQuery.isLoading} />

      <div className="flex flex-wrap gap-2">
        <TabButton active={activeTab === 'kyc'} onClick={() => setActiveTab('kyc')} icon={ShieldCheck}>
          {t('tabs.kyc')}
        </TabButton>
        <TabButton active={activeTab === 'subscription'} onClick={() => setActiveTab('subscription')} icon={CreditCard}>
          {t('tabs.subscription')}
        </TabButton>
        <TabButton active={activeTab === 'team'} onClick={() => setActiveTab('team')} icon={Users}>
          {t('tabs.team')}
        </TabButton>
        <TabButton active={activeTab === 'properties'} onClick={() => setActiveTab('properties')} icon={Home}>
          {t('tabs.properties')}
        </TabButton>
        <TabButton active={activeTab === 'transactions'} onClick={() => setActiveTab('transactions')} icon={CreditCard}>
          {t('tabs.transactions')}
        </TabButton>
      </div>

      {activeTab === 'kyc' ? (
        <AgencyKycTab dossier={kycQuery.data?.data} loading={kycQuery.isLoading} agencyId={agencyId} />
      ) : null}
      {activeTab === 'subscription' ? (
        <AdminAgencySubscriptionPanel agencyId={agencyId} />
      ) : null}
      {activeTab === 'team' ? (
        <AgencyTeamTab members={teamQuery.data?.data ?? []} loading={teamQuery.isLoading} />
      ) : null}
      {activeTab === 'properties' ? (
        <AgencyPropertiesTab properties={propertiesQuery.data?.data ?? []} loading={propertiesQuery.isLoading} />
      ) : null}
      {activeTab === 'transactions' ? (
        <AgencyTransactionsTab health={health} loading={healthQuery.isLoading} />
      ) : null}
    </div>
  );
}

export function AgencyKycTab({ dossier, loading, agencyId }: { dossier?: KycDossier; loading: boolean; agencyId: number }) {
  const t = useTranslations('superAdmin.agencyDetail');
  if (loading) {
    return <Skeleton className="h-72 rounded-xl" />;
  }

  if (!dossier) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">
          {t('kycLoadError')}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
      <KycDossierTimeline dossier={dossier} />
      <KycReviewPanel dossier={dossier} agencyId={agencyId} />
    </div>
  );
}

export function AgencyDetailHeader({ agency }: { agency: AdminAgencyDetail }) {
  const t = useTranslations('superAdmin.agencyDetail');
  const tStatus = useTranslations('superAdmin.agencyStatus');
  const status = agency.status ?? 'inactive';
  const statusKey = STATUS_KEY[status];
  const address = [agency.address?.city, agency.address?.region, agency.address?.country]
    .filter(Boolean)
    .join(', ');

  return (
    <header className="rounded-xl bg-white p-5 ring-1 ring-stone-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-700">
            {agency.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={agency.logo_url} alt="" className="size-16 rounded-xl object-cover" />
            ) : (
              <Building2 className="size-7" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">
              {t('crossTenant')}
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-stone-950">
              {agency.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-stone-600">
              <Badge variant="secondary">{statusKey ? tStatus(statusKey) : status}</Badge>
              {agency.is_verified ? (
                <Badge className="gap-1 bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
                  <BadgeCheck className="size-3" aria-hidden="true" />
                  {t('verified')}
                </Badge>
              ) : (
                <Badge variant="outline">{t('notVerified')}</Badge>
              )}
              <span>{t('registeredOn', { date: formatDate(agency.created_at) })}</span>
              {address ? <span>{address}</span> : null}
            </div>
          </div>
        </div>
        <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={agency.public_url}>
          {t('publicProfile')}
          <ExternalLink className="ml-2 size-4" aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}

export function AgencyModerationActionsMenu({ agency }: { agency: AdminAgencyDetail }) {
  const t = useTranslations('superAdmin.agencyDetail');
  const [pending, setPending] = useState<Action | null>(null);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (action: Action) => postAgencyAction(agency.id, action),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['super-admin', 'agencies'] }),
        queryClient.invalidateQueries({ queryKey: ['super-admin', 'agency', agency.id] }),
      ]);
      setPending(null);
    },
  });
  const meta = pending ? actionMeta(t)[pending] : null;

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-stone-950 p-4 text-white">
      <div>
        <h2 className="font-display text-base font-semibold">{t('moderationTitle')}</h2>
        <p className="text-sm text-stone-300">{t('moderationSubtitle')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setPending('verify')} disabled={mutation.isPending}>
          <CheckCircle2 className="mr-2 size-4" aria-hidden="true" />
          {t('actions.verify.label')}
        </Button>
        <Button size="sm" variant="destructive" onClick={() => setPending('suspend')} disabled={mutation.isPending}>
          <Ban className="mr-2 size-4" aria-hidden="true" />
          {t('actions.suspend.label')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setPending('unverify')} disabled={mutation.isPending}>
          <ShieldOff className="mr-2 size-4" aria-hidden="true" />
          {t('actions.unverify.label')}
        </Button>
      </div>
      {meta ? (
        <ConfirmActionDialog
          open={pending !== null}
          onOpenChange={(open) => !open && setPending(null)}
          title={meta.title}
          description={meta.description}
          confirmPhrase={meta.phrase}
          confirmLabel={meta.label}
          destructive={meta.destructive}
          pending={mutation.isPending}
          onConfirm={() => pending && mutation.mutate(pending)}
        />
      ) : null}
    </section>
  );
}

export function AgencyHealthStrip({ health, loading }: { health?: AdminAgencyHealth; loading: boolean }) {
  const t = useTranslations('superAdmin.agencyDetail.health');
  const items = [
    { label: t('activeProperties'), value: health?.active_properties, icon: Home },
    { label: t('inModeration'), value: health?.properties_in_moderation, icon: AlertTriangle },
    { label: t('transactions30d'), value: health?.transactions_30d, icon: CreditCard },
    { label: t('revenue30d'), value: health ? formatCurrency(health.revenue_30d) : undefined, icon: ArrowUpRight },
    { label: t('lastPayment'), value: health?.last_platform_payment_at ? formatDate(health.last_platform_payment_at) : '—', icon: Clock },
    { label: t('openComplaints'), value: health?.open_complaints, icon: AlertTriangle },
  ];

  return (
    <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-stone-600">{item.label}</span>
                <Icon className="size-4 text-amber-700" aria-hidden="true" />
              </div>
              {loading ? (
                <Skeleton className="mt-3 h-7 w-20" />
              ) : (
                <p className="mt-2 text-2xl font-semibold text-stone-950">{item.value ?? 0}</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}

export function AgencyTeamTab({ members, loading }: { members: AdminAgencyTeamMember[]; loading: boolean }) {
  const t = useTranslations('superAdmin.agencyDetail.team');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? <Skeleton className="h-24" /> : null}
        {!loading && members.length === 0 ? <p className="text-sm text-stone-500">{t('empty')}</p> : null}
        {members.map((member) => (
          <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 p-3">
            <div>
              <p className="font-medium text-stone-950">{member.full_name || member.email}</p>
              <p className="text-sm text-stone-600">{member.email}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {member.roles.map((role) => (
                <Badge key={role} variant="secondary">{role}</Badge>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function AgencyPropertiesTab({ properties, loading }: { properties: AdminPropertyRow[]; loading: boolean }) {
  const t = useTranslations('superAdmin.agencyDetail.properties');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? <Skeleton className="h-24" /> : null}
        {!loading && properties.length === 0 ? <p className="text-sm text-stone-500">{t('empty')}</p> : null}
        {properties.map((property) => (
          <div key={property.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 p-3">
            <div>
              <p className="font-medium text-stone-950">{property.title}</p>
              <p className="text-sm text-stone-600">
                {property.reference_number} · {property.status_label ?? property.status ?? '—'}
              </p>
            </div>
            <p className="font-semibold text-stone-950">{formatCurrency(property.price)}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function AgencyTransactionsTab({ health, loading }: { health?: AdminAgencyHealth; loading: boolean }) {
  const t = useTranslations('superAdmin.agencyDetail.transactions');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        {loading ? (
          <Skeleton className="h-24 md:col-span-3" />
        ) : (
          <>
            <Metric label={t('count30d')} value={String(health?.transactions_30d ?? 0)} />
            <Metric label={t('revenue30d')} value={formatCurrency(health?.revenue_30d ?? 0)} />
            <Metric label={t('lastPayment')} value={health?.last_platform_payment_at ? formatDate(health.last_platform_payment_at) : '—'} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Users;
  children: React.ReactNode;
}) {
  return (
    <Button type="button" variant={active ? 'default' : 'outline'} onClick={onClick}>
      <Icon className="mr-2 size-4" aria-hidden="true" />
      {children}
    </Button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-stone-200 p-3">
      <p className="text-sm text-stone-600">{label}</p>
      <p className="mt-1 text-xl font-semibold text-stone-950">{value}</p>
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value));
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    maximumFractionDigits: 0,
  }).format(value);
}
