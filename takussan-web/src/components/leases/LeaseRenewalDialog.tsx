'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
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
import { DatePicker } from '@/components/ui/date-picker';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { useRenewLease, type RenewLeasePayload } from '@/lib/queries/leases';
import type { Lease } from '@/types/lease';

interface LeaseRenewalDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly parent: Lease;
  readonly onRenewed?: (childId: number) => void;
}

type Step = 1 | 2 | 3;

type FormState = {
  start_date: string;
  end_date: string;
  monthly_rent: string;
  deposit_amount: string;
  late_fee_percent: string;
  late_fee_grace_days: string;
  terms: string;
};

function defaultStartDate(parent: Lease): string {
  if (!parent.end_date) return new Date().toISOString().slice(0, 10);
  const next = new Date(parent.end_date);
  next.setDate(next.getDate() + 1);
  return next.toISOString().slice(0, 10);
}

function defaultEndDate(start: string): string {
  if (!start) return '';
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  return end.toISOString().slice(0, 10);
}

function num(value: string): number | undefined {
  if (value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * TCK-089 — Wizard 3 étapes pour créer un avenant chaîné.
 *
 * Pré-remplit avec les valeurs du parent ; les champs modifiables sont
 * mis en surbrillance dans le récap (étape 3) lorsque la valeur diffère.
 * `tenant_id` / `property_id` ne sont pas exposés — l'API les rejette
 * avec 422 (`prohibited`) pour préserver l'intégrité de la chaîne.
 */
export function LeaseRenewalDialog({
  open,
  onOpenChange,
  parent,
  onRenewed,
}: LeaseRenewalDialogProps) {
  const t = useTranslations('lease.renewal');
  const renew = useRenewLease(parent.id);
  const [step, setStep] = useState<Step>(1);
  const [error, setError] = useState<string | null>(null);
  const initialStart = useMemo(() => defaultStartDate(parent), [parent]);
  const [form, setForm] = useState<FormState>({
    start_date: initialStart,
    end_date: defaultEndDate(initialStart),
    monthly_rent: parent.monthly_rent !== null ? String(parent.monthly_rent) : '',
    deposit_amount: parent.deposit_amount !== null ? String(parent.deposit_amount) : '',
    late_fee_percent: '',
    late_fee_grace_days: '',
    terms: parent.terms ?? '',
  });

  const parentRent = parent.monthly_rent ?? 0;
  const newRent = num(form.monthly_rent) ?? parentRent;
  const deltaPercent =
    parentRent > 0 ? ((newRent - parentRent) / parentRent) * 100 : 0;
  const sign = deltaPercent > 0 ? '+' : deltaPercent < 0 ? '' : '±';

  const diffs = useMemo(
    () => ({
      start_date: form.start_date !== parent.start_date,
      end_date: form.end_date !== (parent.end_date ?? ''),
      monthly_rent: num(form.monthly_rent) !== parent.monthly_rent,
      deposit_amount: num(form.deposit_amount) !== parent.deposit_amount,
      late_fee_percent: num(form.late_fee_percent) !== undefined,
      late_fee_grace_days: num(form.late_fee_grace_days) !== undefined,
      terms: (form.terms || null) !== parent.terms,
    }),
    [form, parent],
  );

  function reset() {
    setStep(1);
    setError(null);
    const start = defaultStartDate(parent);
    setForm({
      start_date: start,
      end_date: defaultEndDate(start),
      monthly_rent: parent.monthly_rent !== null ? String(parent.monthly_rent) : '',
      deposit_amount: parent.deposit_amount !== null ? String(parent.deposit_amount) : '',
      late_fee_percent: '',
      late_fee_grace_days: '',
      terms: parent.terms ?? '',
    });
  }

  async function submit() {
    setError(null);
    const payload: RenewLeasePayload = {
      start_date: form.start_date,
      ...(form.end_date ? { end_date: form.end_date } : {}),
      ...(num(form.monthly_rent) !== undefined ? { monthly_rent: num(form.monthly_rent) } : {}),
      ...(num(form.deposit_amount) !== undefined
        ? { deposit_amount: num(form.deposit_amount) }
        : {}),
      ...(num(form.late_fee_percent) !== undefined
        ? { late_fee_percent: num(form.late_fee_percent) }
        : {}),
      ...(num(form.late_fee_grace_days) !== undefined
        ? { late_fee_grace_days: num(form.late_fee_grace_days) }
        : {}),
      ...(form.terms.trim() !== '' ? { terms: form.terms } : {}),
    };

    try {
      const response = await renew.mutateAsync(payload);
      onRenewed?.(response.data.id);
      onOpenChange(false);
      reset();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.displayMessage);
      } else {
        setError(t('error_generic'));
      }
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('wizard_title')}</DialogTitle>
          <DialogDescription>{t('wizard_subtitle')}</DialogDescription>
        </DialogHeader>

        <ol className="mb-4 flex items-center gap-3 text-xs">
          {([1, 2, 3] as const).map((n) => (
            <li
              key={n}
              className={`flex items-center gap-2 rounded-full px-3 py-1 ${
                step === n
                  ? 'bg-stone-900 text-white'
                  : step > n
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-stone-100 text-stone-500'
              }`}
            >
              <span className="font-semibold">{n}</span>
              <span>{t(['step_period', 'step_terms', 'step_summary'][n - 1] as never)}</span>
            </li>
          ))}
        </ol>

        {error && <ErrorState className="mb-3" message={error} />}

        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-stone-700" htmlFor="renew-start">{t('field_start_date')}</label>
                <DatePicker
                  id="renew-start"
                  value={form.start_date}
                  onValueChange={(value) =>
                    setForm((s) => ({
                      ...s,
                      start_date: value,
                      end_date: defaultEndDate(value),
                    }))
                  }
                />
              </div>
              <div>
                <label className="text-xs font-medium text-stone-700" htmlFor="renew-end">{t('field_end_date')}</label>
                <DatePicker
                  id="renew-end"
                  value={form.end_date}
                  onValueChange={(value) => setForm((s) => ({ ...s, end_date: value }))}
                />
              </div>
            </div>
            <p className="text-xs text-stone-500">{t('tenant_immutable')}</p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-stone-700" htmlFor="renew-rent">{t('field_monthly_rent')}</label>
                <Input
                  id="renew-rent"
                  type="number"
                  min={0}
                  step={1000}
                  value={form.monthly_rent}
                  onChange={(e) => setForm((s) => ({ ...s, monthly_rent: e.target.value }))}
                />
                {parentRent > 0 && newRent !== parentRent && (
                  <p className="mt-1 text-xs text-stone-500">
                    {t('rent_evolution', {
                      sign,
                      percent: deltaPercent.toFixed(1),
                      from: parentRent.toLocaleString(),
                      to: newRent.toLocaleString(),
                    })}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-stone-700" htmlFor="renew-deposit">{t('field_deposit_amount')}</label>
                <Input
                  id="renew-deposit"
                  type="number"
                  min={0}
                  step={1000}
                  value={form.deposit_amount}
                  onChange={(e) => setForm((s) => ({ ...s, deposit_amount: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-stone-700" htmlFor="renew-late-pct">{t('field_late_fee_percent')}</label>
                <Input
                  id="renew-late-pct"
                  type="number"
                  min={0}
                  max={50}
                  step={0.5}
                  value={form.late_fee_percent}
                  onChange={(e) => setForm((s) => ({ ...s, late_fee_percent: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-stone-700" htmlFor="renew-grace">{t('field_late_fee_grace_days')}</label>
                <Input
                  id="renew-grace"
                  type="number"
                  min={0}
                  max={30}
                  value={form.late_fee_grace_days}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, late_fee_grace_days: e.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-stone-700" htmlFor="renew-terms">{t('field_terms')}</label>
              <Textarea
                id="renew-terms"
                rows={3}
                value={form.terms}
                onChange={(e) => setForm((s) => ({ ...s, terms: e.target.value }))}
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <RenewalDiffRow
              label={t('field_start_date')}
              from={parent.start_date}
              to={form.start_date}
              modified={diffs.start_date}
            />
            <RenewalDiffRow
              label={t('field_end_date')}
              from={parent.end_date ?? '—'}
              to={form.end_date || '—'}
              modified={diffs.end_date}
            />
            <RenewalDiffRow
              label={t('field_monthly_rent')}
              from={parent.monthly_rent !== null ? String(parent.monthly_rent) : '—'}
              to={form.monthly_rent || '—'}
              modified={diffs.monthly_rent}
            />
            <RenewalDiffRow
              label={t('field_deposit_amount')}
              from={parent.deposit_amount !== null ? String(parent.deposit_amount) : '—'}
              to={form.deposit_amount || '—'}
              modified={diffs.deposit_amount}
            />
            <RenewalDiffRow
              label={t('field_late_fee_percent')}
              from="—"
              to={form.late_fee_percent || '—'}
              modified={diffs.late_fee_percent}
            />
            <RenewalDiffRow
              label={t('field_late_fee_grace_days')}
              from="—"
              to={form.late_fee_grace_days || '—'}
              modified={diffs.late_fee_grace_days}
            />
            <RenewalDiffRow
              label={t('field_terms')}
              from={parent.terms ?? '—'}
              to={form.terms || '—'}
              modified={diffs.terms}
            />
          </div>
        )}

        <div className="mt-5 flex justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => (step === 1 ? onOpenChange(false) : setStep((step - 1) as Step))}
          >
            {step === 1 ? t('cancel') : t('back')}
          </Button>
          {step < 3 ? (
            <Button
              type="button"
              onClick={() => setStep((step + 1) as Step)}
              disabled={!form.start_date}
            >
              {t('next')}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => {
                void submit();
              }}
              disabled={renew.isPending || !form.start_date}
            >
              {renew.isPending ? t('submitting') : t('submit')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RenewalDiffRow({
  label,
  from,
  to,
  modified,
}: {
  readonly label: string;
  readonly from: string;
  readonly to: string;
  readonly modified: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 rounded-md px-3 py-2 text-sm ${
        modified ? 'bg-amber-50' : 'bg-stone-50'
      }`}
    >
      <span className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</span>
      <span className="flex flex-1 items-baseline justify-end gap-2">
        <span className="text-stone-400 line-through">{from}</span>
        <span className={`font-medium ${modified ? 'text-amber-700' : 'text-stone-700'}`}>{to}</span>
      </span>
    </div>
  );
}
