'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  ScrollText,
  ShieldCheck,
  User as UserIcon,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { PdfViewer } from '@/components/files/PdfViewer';
import {
  ReviewActionsModal,
  type ReviewMode,
} from '@/components/super-admin/ReviewActionsModal';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchAdminAgencyUpgradeRequest,
  type AdminAgencyUpgradeRequestDetail,
} from '@/lib/queries/super-admin';
import { PageHeader, StatusBadge, type StatusTone } from '@/components/console';
import { ErrorState } from '@/components/feedback';
import { useFormatteurs } from '@/lib/format/useFormatteurs';

/**
 * TCK-268 — Detail page for one agency upgrade request.
 *
 * Layout:
 *  1. Récap demande (legal fields + statuts PDF preview).
 *  2. Historique agence (counts: properties, other requests).
 *  3. Décision : action buttons if pending, frozen summary otherwise.
 */
export default function AgencyUpgradeRequestDetailPage() {
  // Le hook se place AVANT la sortie anticipée sur l'identifiant invalide : après, ce serait
  // un hook conditionnel, que le React Compiler (ADR-0015) refuse.
  const t = useTranslations('superAdmin.pages.upgradeRequestDetail');
  const fmt = useFormatteurs();
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const queryClient = useQueryClient();

  const [actionMode, setActionMode] = useState<ReviewMode | null>(null);

  const query = useQuery({
    queryKey: ['super-admin', 'agency-upgrade-requests', id],
    queryFn: () => fetchAdminAgencyUpgradeRequest(id),
    enabled: Number.isFinite(id) && id > 0,
  });

  if (!Number.isFinite(id) || id <= 0) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorState message={t('invalidId')} />
      </div>
    );
  }

  const detail = query.data;

  return (
    <div className="space-y-6">
      <BackLink />

      {query.isLoading ? <Skeleton className="h-64" /> : null}
      {query.isError ? <ErrorState message={t('loadError')} /> : null}

      {detail ? (
        <>
          <PageHeader
            title={t('requestNumber', { id: String(detail.id) })}
            description={t('submittedOn', { date: fmt.dateTime(detail.submitted_at) })}
            actions={<DecisionBadge detail={detail} />}
          />

          <RecapSection detail={detail} />
          <HistorySection detail={detail} />
          <DecisionSection
            detail={detail}
            onApprove={() => setActionMode('approve')}
            onReject={() => setActionMode('reject')}
          />
        </>
      ) : null}

      {actionMode ? (
        <ReviewActionsModal
          open={Boolean(actionMode)}
          mode={actionMode}
          requestId={id}
          onOpenChange={(open) => {
            if (!open) setActionMode(null);
          }}
          onDecided={() => {
            queryClient.invalidateQueries({
              queryKey: ['super-admin', 'agency-upgrade-requests', id],
            });
            queryClient.invalidateQueries({
              queryKey: ['super-admin', 'agency-upgrade-requests'],
            });
            queryClient.invalidateQueries({
              queryKey: ['super-admin', 'agency-upgrade-requests', 'pending-count'],
            });
          }}
        />
      ) : null}
    </div>
  );
}

function BackLink() {
  const t = useTranslations('superAdmin.pages.upgradeRequestDetail');

  return (
    <Link
      href="/super-admin/agency-upgrade-requests"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t('back')}
    </Link>
  );
}

function RecapSection({ detail }: { readonly detail: AdminAgencyUpgradeRequestDetail }) {
  const t = useTranslations('superAdmin.pages.upgradeRequestDetail');
  const docs = detail.documents ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="size-4 text-primary" aria-hidden="true" />
          {t('recap.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('recap.legalName')} value={detail.company_legal_name} />
          <Field label={t('recap.fiscalAddress')} value={detail.address_fiscale} />
          <Field label={t('recap.rc')} value={detail.rc} mono />
          <Field label={t('recap.ninea')} value={detail.ninea} mono />
          <Field label={t('recap.ribPro')} value={detail.rib_pro} mono />
          <Field
            label={t('recap.plannedAgents')}
            value={detail.planned_agents_count?.toString() ?? null}
          />
        </div>

        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
            {t('recap.legalDocs', { count: String(docs.length) })}
          </p>
          {docs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('recap.noDocument')}</p>
          ) : (
            <div className="space-y-3">
              {docs.map((doc) => (
                <PdfViewer
                  key={doc.id}
                  url={doc.media_url}
                  filename={doc.name ?? `document-${doc.id}.pdf`}
                />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function HistorySection({ detail }: { readonly detail: AdminAgencyUpgradeRequestDetail }) {
  const t = useTranslations('superAdmin.pages.upgradeRequestDetail');
  const fmt = useFormatteurs();
  const agency = detail.agency;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="size-4 text-primary" aria-hidden="true" />
          {t('history.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          icon={<UserIcon className="size-4" aria-hidden="true" />}
          label={t('history.currentKind')}
          value={agency?.kind ?? '—'}
        />
        <Stat
          icon={<CalendarDays className="size-4" aria-hidden="true" />}
          label={t('history.createdOn')}
          value={fmt.date(agency?.created_at)}
        />
        <Stat
          icon={<ScrollText className="size-4" aria-hidden="true" />}
          label={t('history.publishedProperties')}
          value={String(detail.counts?.properties ?? 0)}
        />
        <Stat
          icon={<ScrollText className="size-4" aria-hidden="true" />}
          label={t('history.otherRequests')}
          value={String(detail.counts?.other_requests ?? 0)}
        />
        {agency ? (
          <div className="sm:col-span-3">
            <Link
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
              href={`/super-admin/agencies/${agency.id}`}
            >
              {t('history.openAgency')}
            </Link>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DecisionSection({
  detail,
  onApprove,
  onReject,
}: {
  readonly detail: AdminAgencyUpgradeRequestDetail;
  readonly onApprove: () => void;
  readonly onReject: () => void;
}) {
  const t = useTranslations('superAdmin.pages.upgradeRequestDetail');
  const fmt = useFormatteurs();
  const isPending = detail.status === 'pending';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
          {t('decision.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="flex flex-wrap gap-3">
            <Button onClick={onApprove}>
              <CheckCircle2 className="size-4" aria-hidden="true" />
              <span>{t('decision.approve')}</span>
            </Button>
            <Button variant="destructive" onClick={onReject}>
              <XCircle className="size-4" aria-hidden="true" />
              <span>{t('decision.reject')}</span>
            </Button>
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border border-border bg-muted p-4">
            <DecisionBadge detail={detail} />
            <Field label={t('decision.decidedOn')} value={fmt.dateTime(detail.reviewed_at)} />
            {detail.reviewer ? (
              <Field
                label={t('decision.by')}
                value={
                  [detail.reviewer.first_name, detail.reviewer.last_name]
                    .filter(Boolean)
                    .join(' ') ||
                  detail.reviewer.email ||
                  t('decision.userFallback', { id: String(detail.reviewed_by ?? '') })
                }
              />
            ) : null}
            {detail.review_comment ? (
              <Field label={t('decision.comment')} value={detail.review_comment} multiline />
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DecisionBadge({ detail }: { readonly detail: AdminAgencyUpgradeRequestDetail }) {
  const t = useTranslations('superAdmin.pages.upgradeRequestDetail');
  // ⚠ Ces libellés ne sont PAS ceux d'`agency.upgrade.status.badges` (côté agence), qui dit
  // « Refusée » là où cette console dit « Rejetée ». Tables volontairement distinctes.
  // TCK-358 — mêmes SENS que la liste (`STATUS_TONES` de `../page.tsx`), même primitive : les
  // quatre couleurs faites main qui vivaient ici étaient une seconde table de vérité de la
  // couleur, à un statut près de diverger de celle de la liste.
  const map: Record<string, { labelKey: string; tone: StatusTone }> = {
    pending: { labelKey: 'status.pending', tone: 'attention' },
    approved: { labelKey: 'status.approved', tone: 'success' },
    rejected: { labelKey: 'status.rejected', tone: 'danger' },
    revoked: { labelKey: 'status.revoked', tone: 'neutral' },
  };
  const conf = map[detail.status];
  const label = conf ? t(conf.labelKey) : detail.status;
  return <StatusBadge tone={conf?.tone ?? 'neutral'} label={label} className="px-2.5 py-1" />;
}

function Field({
  label,
  value,
  mono,
  multiline,
}: {
  readonly label: string;
  readonly value: string | null;
  readonly mono?: boolean;
  readonly multiline?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`text-sm text-foreground ${mono ? 'font-mono' : ''} ${
          multiline ? 'whitespace-pre-wrap' : ''
        }`}
      >
        {value && value.length > 0 ? value : '—'}
      </p>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
