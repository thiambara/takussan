'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, X, Loader2 } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import {
  approveProperty,
  rejectProperty,
  type ModerationProperty,
} from '@/lib/queries/property-moderation';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';

interface PropertyModerationDetailProps {
  readonly property: ModerationProperty;
  readonly onModerated: () => void;
}

export function PropertyModerationDetail({
  property,
  onModerated,
}: PropertyModerationDetailProps) {
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
      setErrorMessage(err instanceof ApiError ? err.displayMessage : 'Une erreur est survenue.');
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
      setErrorMessage(err instanceof ApiError ? err.displayMessage : 'Une erreur est survenue.');
    },
  });

  const handleReject = () => {
    if (rejectionReason.trim().length < 20) {
      setErrorMessage('La raison doit contenir au moins 20 caractères.');
      return;
    }
    rejectMutation.mutate();
  };

  const isBusy = approveMutation.isPending || rejectMutation.isPending;

  return (
    <section className="rounded-xl bg-app-surface-1 p-6">
      <div className="mb-6 flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-app-ink">{property.title}</h2>
        <p className="text-sm text-app-ink-muted">
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
          <dt className="text-xs font-medium uppercase tracking-wide text-app-ink-muted">Agent</dt>
          <dd className="mt-1 text-app-ink">{property.owner?.name ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-app-ink-muted">Prix</dt>
          <dd className="mt-1 text-app-ink">
            {property.price?.toLocaleString('fr-FR')} {property.currency ?? ''}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-app-ink-muted">Type</dt>
          <dd className="mt-1 text-app-ink">{property.type}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-app-ink-muted">Soumis le</dt>
          <dd className="mt-1 text-app-ink">
            {property.submitted_at
              ? new Date(property.submitted_at).toLocaleDateString('fr-FR')
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
            Raison du rejet (obligatoire, min. 20 caractères)
          </p>
          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={4}
            maxLength={1000}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-app-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            placeholder="Expliquez clairement pourquoi ce bien est refusé…"
          />
          <p className="mt-1 text-right text-xs text-app-ink-muted">
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
              Confirmer le rejet
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
              Annuler
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
            Approuver
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
            Rejeter
          </Button>
        </div>
      )}
    </section>
  );
}
