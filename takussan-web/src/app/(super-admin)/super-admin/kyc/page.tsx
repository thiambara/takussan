'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Building2, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchAdminKycQueue } from '@/lib/queries/super-admin';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/kyc/kyc-components';
import { PageHeader } from '@/components/console';

export default function Page() {
  const t = useTranslations('superAdmin.pages.kyc');
  const tPagination = useTranslations('console.pagination');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['super-admin', 'kyc', page],
    queryFn: () => fetchAdminKycQueue({ page, perPage: 20 }),
  });

  const dossiers = query.data?.data ?? [];
  const meta = query.data?.meta;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('submittedFiles')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {query.isLoading ? <Skeleton className="h-28" /> : null}
          {!query.isLoading && dossiers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
          ) : null}
          {dossiers.map((dossier) => (
            <div key={dossier.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Building2 className="size-4 text-primary" aria-hidden="true" />
                  <p className="font-medium text-foreground">{t('agency', { id: String(dossier.subject_id) })}</p>
                  <StatusBadge status={dossier.status} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{t('submittedOn', { date: formatDate(dossier.submitted_at) })}</p>
              </div>
              <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={`/super-admin/agencies/${dossier.subject_id}`}>
                {t('open')}
              </Link>
            </div>
          ))}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              <ChevronLeft className="mr-1 size-4" aria-hidden="true" />
              {tPagination('previous')}
            </Button>
            <span className="text-sm text-muted-foreground">
              {tPagination('positionSlash', {
                page: String(meta?.current_page ?? page),
                lastPage: String(meta?.last_page ?? 1),
              })}
            </span>
            <Button type="button" variant="outline" size="sm" disabled={!meta || page >= meta.last_page} onClick={() => setPage((value) => value + 1)}>
              {tPagination('next')}
              <ChevronRight className="ml-1 size-4" aria-hidden="true" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
