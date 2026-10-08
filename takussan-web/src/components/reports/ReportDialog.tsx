'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import type { ReportPayload } from '@/types/visit';

export interface ReportReason {
  readonly value: string;
  readonly label: string;
}

interface ReportDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: string;
  /** Le premier motif est celui proposé par défaut — « arnaque » en tête (TCK-597). */
  readonly reasons: ReadonlyArray<ReportReason>;
  readonly onSubmit: (payload: ReportPayload) => Promise<{ ok: boolean; message?: string }>;
  /** Le champ libre : l'annonce le reçoit, l'avis ne garde que le motif. */
  readonly withDetails?: boolean;
}

/**
 * TCK-597 (V12) — le dialogue de signalement, commun à l'annonce et à l'avis.
 *
 * Aucune barrière de connexion : signaler est ouvert à tout visiteur. La confirmation dit la
 * vérité — « nous allons examiner », jamais « retiré » — et n'annonce le suivi qu'à un visiteur
 * connecté, le seul que l'API sait prévenir.
 */
export function ReportDialog({
  open,
  onOpenChange,
  title,
  description,
  reasons,
  onSubmit,
  withDetails = true,
}: ReportDialogProps) {
  const t = useTranslations('property.report');
  const { user } = useAuth();
  const idPrefix = useId();
  const [reason, setReason] = useState(reasons[0]?.value ?? 'other');
  const [details, setDetails] = useState('');
  const [company, setCompany] = useState(''); // pot de miel
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function reset(): void {
    setReason(reasons[0]?.value ?? 'other');
    setDetails('');
    setCompany('');
    setError(null);
    setSent(false);
  }

  function handleOpenChange(next: boolean): void {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await onSubmit({
      reason,
      details: withDetails ? details.trim() || undefined : undefined,
      company: company || undefined,
    });
    setSubmitting(false);
    if (res.ok) setSent(true);
    else setError(res.message ?? null);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {sent ? (
          <div className="space-y-4">
            <p role="status" className="rounded-md border border-success/30 bg-card px-3 py-2 text-sm text-foreground">
              {t('thanks')}
              {user ? <> {t('thanksNotified')}</> : null}
            </p>
            <div className="flex justify-end">
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                {t('close')}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-1 text-sm">
              <span className="text-foreground">{t('reasonLabel')}</span>
              <Select value={reason} onValueChange={(v) => setReason((v as string | null) ?? reason)} items={[...reasons]}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {reasons.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {withDetails ? (
              <label className="block space-y-1 text-sm">
                <span className="text-foreground">{t('detailsLabel')}</span>
                <Textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder={t('detailsPlaceholder')}
                  rows={3}
                  maxLength={1000}
                />
              </label>
            ) : null}
            {/* Pot de miel — hors écran et `aria-hidden`, jamais `display:none` : un robot évite ce
                que le CSS cache complètement (cf. `AnonymousLeadDialog`). */}
            <div aria-hidden="true" className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden">
              <label htmlFor={`${idPrefix}-company`}>{t('honeypotLabel')}</label>
              <input
                id={`${idPrefix}-company`}
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? t('sending') : t('submit')}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
