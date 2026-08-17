'use client';

import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { apiRequest, ApiError } from '@/lib/api';
import { buildDepositRefundSchema, type DepositRefundFormValues } from '@/lib/schemas/lease';
import { useQueryClient } from '@tanstack/react-query';

interface DepositRefundModalProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly leaseId: number;
  readonly depositRemaining: number;
  readonly currency: string;
}

/**
 * TCK-088 — Modal "Rembourser la caution".
 *
 * Pré-remplit le montant à `depositRemaining` (cas le plus fréquent — full
 * refund), impose le motif si l'utilisateur le baisse, propose un sélecteur
 * multi-fichiers pour les justificatifs et envoie le tout en multipart.
 *
 * La validation côté client double la garde serveur (schema partagé sous
 * `lib/schemas/lease.ts`) — l'idée n'est pas de remplacer la validation
 * Laravel mais d'éviter un round-trip pour les erreurs triviales.
 */
export function DepositRefundModal({
  open,
  onOpenChange,
  leaseId,
  depositRemaining,
  currency,
}: DepositRefundModalProps) {
  const t = useTranslations('lease.deposit');
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const schema = useMemo(() => buildDepositRefundSchema(depositRemaining), [depositRemaining]);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors },
  } = useForm<DepositRefundFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: depositRemaining,
      reason: '',
    },
  });

  const amount = Number(watch('amount') ?? 0);
  const retained = Math.max(depositRemaining - amount, 0);
  const isPartial = amount + 0.001 < depositRemaining;

  async function onSubmit(values: DepositRefundFormValues) {
    setGlobalError(null);
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('amount', String(values.amount));
      if (values.reason) fd.append('reason', values.reason);
      selectedFiles.forEach((file) => fd.append('uploads[]', file));

      await apiRequest(`/api/leases/${leaseId}/deposit-refund`, {
        method: 'POST',
        body: fd,
        formData: true,
        token: token ?? undefined,
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['leases', 'detail', leaseId] }),
        queryClient.invalidateQueries({ queryKey: ['leases', 'deposit-refund', leaseId] }),
      ]);
      reset();
      setSelectedFiles([]);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        const validation = err.validationErrors;
        if (validation) {
          for (const [field, messages] of Object.entries(validation)) {
            const message = messages[0];
            if (!message) continue;
            if (field === 'amount' || field === 'reason') {
              setError(field, { message });
            } else {
              setGlobalError(message);
            }
          }
          if (!validation.amount && !validation.reason) {
            setGlobalError(err.displayMessage);
          }
        } else {
          setGlobalError(err.displayMessage);
        }
      } else {
        setGlobalError(t('error_generic'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleFiles(event: React.ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.target.files ?? []);
    setSelectedFiles(files);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          setSelectedFiles([]);
          setGlobalError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('modal.title')}</DialogTitle>
          <DialogDescription>{t('modal.subtitle')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            void handleSubmit(onSubmit)(e);
          }}
        >
          {globalError && <ErrorState message={globalError} />}

          <div className="space-y-1">
            <Label htmlFor="deposit-refund-amount">{t('modal.amount_label')}</Label>
            <Input
              id="deposit-refund-amount"
              type="number"
              min={0.01}
              step={1000}
              {...register('amount', { valueAsNumber: true })}
            />
            <p className="text-xs text-stone-500">
              {t('modal.remaining', {
                amount: depositRemaining.toLocaleString(),
                currency,
              })}
            </p>
            {errors.amount?.message && (
              <p className="text-xs text-red-600">{errors.amount.message}</p>
            )}
          </div>

          <div className="rounded-md bg-stone-50 p-3 text-sm text-stone-700">
            <p>
              {t('modal.breakdown_refund', {
                amount: amount.toLocaleString(),
                currency,
              })}
            </p>
            {retained > 0 && (
              <p className="mt-1 font-medium text-amber-700">
                {t('modal.breakdown_retained', {
                  amount: retained.toLocaleString(),
                  currency,
                })}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="deposit-refund-reason">
              {t('modal.reason_label')}
              {isPartial && <span className="ml-1 text-red-600">*</span>}
            </Label>
            <Textarea
              id="deposit-refund-reason"
              rows={3}
              placeholder={t('modal.reason_placeholder')}
              {...register('reason')}
            />
            {errors.reason?.message && (
              <p className="text-xs text-red-600">{errors.reason.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="deposit-refund-files">{t('modal.attachments_label')}</Label>
            <input
              id="deposit-refund-files"
              ref={fileInputRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              onChange={handleFiles}
              className="block w-full rounded-md border border-stone-300 bg-white p-2 text-sm"
            />
            {selectedFiles.length > 0 && (
              <ul className="text-xs text-stone-500">
                {selectedFiles.map((file) => (
                  <li key={file.name}>{file.name}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('modal.cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t('modal.submitting') : t('modal.submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
