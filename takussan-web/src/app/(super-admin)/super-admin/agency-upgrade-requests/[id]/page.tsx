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

/**
 * TCK-268 — Detail page for one agency upgrade request.
 *
 * Layout:
 *  1. Récap demande (legal fields + statuts PDF preview).
 *  2. Historique agence (counts: properties, other requests).
 *  3. Décision : action buttons if pending, frozen summary otherwise.
 */
export default function AgencyUpgradeRequestDetailPage() {
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
        <p className="text-sm text-red-600">Identifiant de demande invalide.</p>
      </div>
    );
  }

  const detail = query.data;

  return (
    <div className="space-y-6">
      <BackLink />

      {query.isLoading ? <Skeleton className="h-64" /> : null}
      {query.isError ? (
        <Card>
          <CardContent className="p-6 text-sm text-red-600">
            Impossible de charger cette demande pour le moment.
          </CardContent>
        </Card>
      ) : null}

      {detail ? (
        <>
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">
                Demande #{detail.id}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Soumise le {formatDateTime(detail.submitted_at)}
              </p>
            </div>
            <DecisionBadge detail={detail} />
          </header>

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
  return (
    <Link
      href="/super-admin/agency-upgrade-requests"
      className="inline-flex items-center gap-1 text-sm text-stone-600 transition-colors hover:text-stone-900"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Retour aux demandes
    </Link>
  );
}

function RecapSection({ detail }: { readonly detail: AdminAgencyUpgradeRequestDetail }) {
  const docs = detail.documents ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="size-4 text-amber-600" aria-hidden="true" />
          Récap demande
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Raison sociale" value={detail.company_legal_name} />
          <Field label="Adresse fiscale" value={detail.address_fiscale} />
          <Field label="RC" value={detail.rc} mono />
          <Field label="NINEA" value={detail.ninea} mono />
          <Field label="RIB pro" value={detail.rib_pro} mono />
          <Field
            label="Agents prévus"
            value={detail.planned_agents_count?.toString() ?? null}
          />
        </div>

        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <FileText className="size-4 text-stone-500" aria-hidden="true" />
            Statuts juridiques ({docs.length})
          </p>
          {docs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun document attaché.</p>
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
  const agency = detail.agency;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="size-4 text-amber-600" aria-hidden="true" />
          Historique agence
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          icon={<UserIcon className="size-4" aria-hidden="true" />}
          label="Type actuel"
          value={agency?.kind ?? '—'}
        />
        <Stat
          icon={<CalendarDays className="size-4" aria-hidden="true" />}
          label="Créée le"
          value={agency?.created_at ? formatDate(agency.created_at) : '—'}
        />
        <Stat
          icon={<ScrollText className="size-4" aria-hidden="true" />}
          label="Biens publiés"
          value={String(detail.counts?.properties ?? 0)}
        />
        <Stat
          icon={<ScrollText className="size-4" aria-hidden="true" />}
          label="Autres demandes"
          value={String(detail.counts?.other_requests ?? 0)}
        />
        {agency ? (
          <div className="sm:col-span-3">
            <Link
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
              href={`/super-admin/agencies/${agency.id}`}
            >
              Ouvrir la fiche agence
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
  const isPending = detail.status === 'pending';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-amber-600" aria-hidden="true" />
          Décision
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="flex flex-wrap gap-3">
            <Button onClick={onApprove}>
              <CheckCircle2 className="size-4" aria-hidden="true" />
              <span>Approuver</span>
            </Button>
            <Button variant="destructive" onClick={onReject}>
              <XCircle className="size-4" aria-hidden="true" />
              <span>Rejeter</span>
            </Button>
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-4">
            <DecisionBadge detail={detail} />
            <Field label="Décidée le" value={formatDateTime(detail.reviewed_at)} />
            {detail.reviewer ? (
              <Field
                label="Par"
                value={
                  [detail.reviewer.first_name, detail.reviewer.last_name]
                    .filter(Boolean)
                    .join(' ') ||
                  detail.reviewer.email ||
                  `User #${detail.reviewed_by ?? ''}`
                }
              />
            ) : null}
            {detail.review_comment ? (
              <Field label="Commentaire" value={detail.review_comment} multiline />
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DecisionBadge({ detail }: { readonly detail: AdminAgencyUpgradeRequestDetail }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: 'En attente', className: 'bg-amber-100 text-amber-900' },
    approved: { label: 'Approuvée', className: 'bg-emerald-100 text-emerald-900' },
    rejected: { label: 'Rejetée', className: 'bg-red-100 text-red-900' },
    revoked: { label: 'Révoquée', className: 'bg-stone-200 text-stone-800' },
  };
  const conf = map[detail.status] ?? { label: detail.status, className: 'bg-stone-200 text-stone-800' };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${conf.className}`}
    >
      {conf.label}
    </span>
  );
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
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value));
}
