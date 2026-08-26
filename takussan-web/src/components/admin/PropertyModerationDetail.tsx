'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Check, X, Loader2 } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import {
  approveProperty,
  rejectProperty,
  type ModerationProperty,
} from '@/lib/queries/property-moderation';
import { Button } from '@/components/ui/button';

import { formatDate, formatNumber } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

interface PropertyModerationDetailProps {
  readonly property: ModerationProperty;
  readonly onModerated: () => void;
}

export function PropertyModerationDetail({
  property,
  onModerated,
}: PropertyModerationDetailProps) {
  const t = useTranslations('admin.propertyModeration.detail');
  const locale = useLocale() as Locale;
  const tCommon = useTranslations('common.actions');
  const messageErreur = useMessageErreurApi();
  const { token } = useAuth();
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const approveMutation = useMutation({
    mutationFn: () => approveProperty(property.id, token ?? ''),
    onSuccess: () => {
      setErrorMessage(null);
      onModerated();
    },
    onError: (err) => {
      setErrorMessage(messageErreur(err, t('genericError')));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => rejectProperty(property.id, rejectionReason, token ?? ''),
    onSuccess: () => {
      setShowRejectDialog(false);
      setRejectionReason('');
      setErrorMessage(null);
      onModerated();
    },
    onError: (err) => {
      setErrorMessage(messageErreur(err, t('genericError')));
    },
  });

  const handleReject = () => {
    if (rejectionReason.trim().length < 20) {
      setErrorMessage(t('reasonTooShort'));
      return;
    }
    rejectMutation.mutate();
  };

  const isBusy = approveMutation.isPending || rejectMutation.isPending;

  return (
    <section className="rounded-xl bg-card p-6">
      <div className="mb-6 flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">{property.title}</h2>
        <p className="text-sm text-muted-foreground">
          {property.reference_number}
          {property.agency ? ` · ${property.agency.name}` : ''}
          {property.location?.city ? ` · ${property.location.city}` : ''}
        </p>
      </div>

      {property.main_photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={property.main_photo_url}
          alt={property.title}
          className="mb-6 h-48 w-full rounded-xl object-cover"
        />
      ) : null}

      <dl className="mb-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('agent')}</dt>
          <dd className="mt-1 text-foreground">{property.owner?.name ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('price')}</dt>
          <dd className="mt-1 text-foreground">
            {/* TCK-292 — la locale ACTIVE, plus `fr-FR` en dur (montant et date). */}
            {property.price !== null && property.price !== undefined
              ? formatNumber(property.price, locale)
              : ''}{' '}
            {property.currency ?? ''}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('type')}</dt>
          <dd className="mt-1 text-foreground">{property.type}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('submittedAt')}</dt>
          <dd className="mt-1 text-foreground">
            {property.submitted_at
              ? formatDate(property.submitted_at, locale, {
                dateStyle: undefined,
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })
              : '—'}
          </dd>
        </div>
      </dl>

      {errorMessage ? (
        <p className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {showRejectDialog ? (
        <div className="mb-4 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
          <p className="mb-3 text-sm font-medium text-destructive">
            {t('rejectReasonLabel')}
          </p>
          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={4}
            maxLength={1000}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            placeholder={t('rejectReasonPlaceholder')}
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">
            {rejectionReason.length}/1000
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={handleReject}
              disabled={isBusy}
            >
              {rejectMutation.isPending ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <X className="mr-1.5 size-3.5" />
              )}
              {t('confirmReject')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowRejectDialog(false);
                setRejectionReason('');
                setErrorMessage(null);
              }}
              disabled={isBusy}
            >
              {tCommon('cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => approveMutation.mutate()}
            disabled={isBusy}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {approveMutation.isPending ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Check className="mr-1.5 size-4" />
            )}
            {t('approve')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              setShowRejectDialog(true);
              setErrorMessage(null);
            }}
            disabled={isBusy}
          >
            <X className="mr-1.5 size-4" />
            {t('reject')}
          </Button>
        </div>
      )}
    </section>
  );
}
