'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import { useSubmitMaintenanceQuote } from '@/lib/queries/maintenance';
import type { MaintenanceQuoteLineKind, MaintenanceRequest } from '@/types/maintenance';

/**
 * Ce que `SubmitQuoteRequest` accepte (`mimes:pdf,jpg,jpeg,png,webp`, 5 Mo, 5 pièces). Le sélecteur
 * n'offre que cela ; un fichier d'un autre type est écarté À LA SÉLECTION, nommé, et les autres
 * restent choisis.
 */
export const QUOTE_ATTACHMENT_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp';
const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const ACCEPTED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
const MAX_ATTACHMENTS = 5;

type LineDraft = { label: string; kind: MaintenanceQuoteLineKind; quantity: string; unit_price: string };

const emptyLine = (): LineDraft => ({ label: '', kind: 'labour', quantity: '1', unit_price: '' });

function isAccepted(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ACCEPTED_TYPES.includes(file.type) || (file.type === '' && ACCEPTED_EXTENSIONS.includes(extension));
}

/**
 * TCK-592 (P11, P12) — le devis du prestataire : des LIGNES (main-d'œuvre, fourniture), une date
 * de validité, une durée. Le montant est calculé par l'API ; le total affiché ici n'est qu'un
 * aperçu. Rendu par la fiche quand `abilities.can_submit_quote` — y compris après un refus, où
 * l'ancien formulaire disparaissait.
 */
export function QuoteSubmitForm({ request }: { readonly request: MaintenanceRequest }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('maintenance.intervention.quote_form');
  const tQuote = useTranslations('maintenance.intervention.quote');
  const messageErreur = useMessageErreurApi();
  const mutation = useSubmitMaintenanceQuote(request.id);

  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [validUntil, setValidUntil] = useState('');
  const [duration, setDuration] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  const total = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);

  const updateLine = (index: number, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const pickFiles = (picked: File[]) => {
    const accepted = picked.filter(isAccepted);
    setRejectedFiles(picked.filter((f) => !isAccepted(f)).map((f) => f.name));
    setAttachments((prev) => [...prev, ...accepted].slice(0, MAX_ATTACHMENTS));
  };

  const submit = async () => {
    setLocalError(null);
    const complete = lines.every(
      (l) => l.label.trim() !== '' && Number(l.quantity) > 0 && l.unit_price !== '' && Number(l.unit_price) >= 0,
    );
    if (!complete || !validUntil) {
      setLocalError(t('incomplete'));
      return;
    }
    await mutation.mutateAsync({
      lines: lines.map((l) => ({
        label: l.label.trim(),
        kind: l.kind,
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
      })),
      valid_until: validUntil,
      estimated_duration_days: duration ? Number(duration) : null,
      attachments,
    });
    setLines([emptyLine()]);
    setValidUntil('');
    setDuration('');
    setAttachments([]);
  };

  // Un refus de l'API garde le formulaire tel quel : lignes et pièces restent pour corriger.
  const serverErrors = mutation.error instanceof ApiError ? mutation.error.validationErrors : undefined;
  const attachmentErrors = serverErrors
    ? Object.entries(serverErrors).filter(([field]) => field.startsWith('attachments'))
    : [];

  return (
    <section className="rounded-xl bg-card p-4 sm:p-5">
      <h2 className="font-display text-base font-semibold text-foreground">
        {request.status === 'rejected' ? t('title_again') : t('title')}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">{t('intro')}</p>

      <form
        className="mt-4 space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit().catch(() => undefined);
        }}
      >
        <ol className="space-y-3">
          {lines.map((line, index) => (
            <li key={index} className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_9rem_6rem_8rem_auto]">
              <div className="col-span-2 sm:col-span-1">
                <label htmlFor={`quote-line-label-${index}`} className="mb-1 block text-xs font-medium">
                  {tQuote('line_label')}
                </label>
                <Input
                  id={`quote-line-label-${index}`}
                  value={line.label}
                  onChange={(e) => updateLine(index, { label: e.target.value })}
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <span className="mb-1 block text-xs font-medium">{tQuote('line_kind')}</span>
                <div className="flex gap-1" role="radiogroup" aria-label={tQuote('line_kind')}>
                  {(['labour', 'supply'] as const).map((kind) => (
                    <Button
                      key={kind}
                      type="button"
                      size="sm"
                      role="radio"
                      aria-checked={line.kind === kind}
                      variant={line.kind === kind ? 'default' : 'outline'}
                      className="h-11 flex-1 sm:h-9"
                      onClick={() => updateLine(index, { kind })}
                    >
                      {tQuote(`kinds.${kind}`)}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor={`quote-line-quantity-${index}`} className="mb-1 block text-xs font-medium">
                  {tQuote('line_quantity')}
                </label>
                <Input
                  id={`quote-line-quantity-${index}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={line.quantity}
                  onChange={(e) => updateLine(index, { quantity: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor={`quote-line-price-${index}`} className="mb-1 block text-xs font-medium">
                  {tQuote('line_unit_price')}
                </label>
                <Input
                  id={`quote-line-price-${index}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="1"
                  value={line.unit_price}
                  onChange={(e) => updateLine(index, { unit_price: e.target.value })}
                />
              </div>
              <div className="col-span-2 flex items-end justify-end sm:col-span-1">
                {lines.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('remove_line')}
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
            <Plus aria-hidden="true" />
            {t('add_line')}
          </Button>
          <p className="text-sm font-medium tabular-nums text-foreground">
            {t('total_preview', { amount: formatCurrency(total, locale) })}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="quote-valid-until" className="mb-1.5 block text-sm font-medium">
              {t('valid_until_label')}
            </label>
            <DatePicker id="quote-valid-until" value={validUntil} onValueChange={setValidUntil} />
          </div>
          <div>
            <label htmlFor="quote-duration" className="mb-1.5 block text-sm font-medium">
              {t('duration_label')}
            </label>
            <Input
              id="quote-duration"
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label htmlFor="quote-attachments" className="mb-1.5 block text-sm font-medium">
            {t('attachments_label')}
          </label>
          <input
            id="quote-attachments"
            type="file"
            multiple
            accept={QUOTE_ATTACHMENT_ACCEPT}
            onChange={(e) => {
              pickFiles(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:h-11 file:cursor-pointer file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted sm:file:h-8"
          />
          {attachments.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-foreground">
              {attachments.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2">
                  <span className="truncate">{file.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== index))}
                  >
                    {t('remove_file')}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {rejectedFiles.length > 0 ? (
            <p role="alert" className="mt-1 text-xs text-destructive">
              {t('file_type_refused', { files: rejectedFiles.join(', ') })}
            </p>
          ) : null}
          {attachmentErrors.map(([field, messages]) => (
            <p key={field} role="alert" className="mt-1 text-xs text-destructive">
              {messages[0]}
            </p>
          ))}
        </div>

        {localError ? (
          <p role="alert" className="text-xs text-destructive">{localError}</p>
        ) : null}
        {mutation.isError && attachmentErrors.length === 0 ? (
          <p role="alert" className="text-xs text-destructive">
            {messageErreur(mutation.error, t('failed'))}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button type="submit" className="h-11 sm:h-9" disabled={mutation.isPending}>
            {mutation.isPending ? t('submitting') : t('submit')}
          </Button>
        </div>
      </form>
    </section>
  );
}
