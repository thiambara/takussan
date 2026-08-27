'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import { resubmitProperty } from '@/lib/queries/property-moderation';
import { Button } from '@/components/ui/button';
import type { PropertyDetail } from '@/types/property';
import { useTranslations } from 'next-intl';

interface PropertyModerationBannerProps {
  readonly property: PropertyDetail;
}

export function PropertyModerationBanner({ property }: PropertyModerationBannerProps) {
  const t = useTranslations('property.moderation');
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const resubmitMutation = useMutation({
    mutationFn: () => resubmitProperty(property.id, token ?? ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property', property.id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-properties'] });
    },
  });

  const status = property.status;

  if (status === 'pending_review') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3">
        <Clock className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-warning">{t('pendingTitle')}</p>
          <p className="mt-0.5 text-xs text-warning">{t('pendingBody')}</p>
        </div>
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-destructive">{t('rejectedTitle')}</p>
            {property.rejection_reason ? (
              <p className="mt-1 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {property.rejection_reason}
              </p>
            ) : null}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="self-start border-destructive/30 text-destructive hover:bg-destructive/10"
          onClick={() => resubmitMutation.mutate()}
          disabled={resubmitMutation.isPending}
        >
          {resubmitMutation.isPending ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 size-3.5" />
          )}
          {t('resubmit')}
        </Button>
        {resubmitMutation.isError ? (
          <p className="text-xs text-destructive">{t('resubmitError')}</p>
        ) : null}
      </div>
    );
  }

  if (status === 'available' && property.approved_at) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 px-4 py-3">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-success">{t('approvedTitle')}</p>
          <p className="mt-0.5 text-xs text-success">
            {t('approvedOn', {
              date: new Date(property.approved_at).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              }),
            })}
          </p>
        </div>
      </div>
    );
  }

  return null;
}
