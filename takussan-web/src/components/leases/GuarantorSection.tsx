'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  FormInput,
  FormSelect,
  FormTextarea,
  FormGlobalError,
} from '@/components/forms';
import { useApiForm } from '@/hooks/useApiForm';
import { useCreateGuarantor } from '@/lib/queries/leases';
import { guarantorSchema, type GuarantorFormValues } from '@/lib/schemas/lease';
import type { Guarantor } from '@/types/lease';

interface GuarantorSectionProps {
  readonly leaseId: number;
  readonly guarantor?: Guarantor | null;
  /** Count of guarantors already attached. Max 3 per lease (TCK-044). */
  readonly guarantorsCount?: number;
  /** TCK-173 — false hides the add button for tenants. */
  readonly canManage?: boolean;
}

/** Valeurs d'enum ; les libellés vivent sous `lease.guarantor.idTypes.*`. */
const ID_TYPES = ['id_card', 'passport', 'driving_license'] as const;

const MAX_GUARANTORS = 3;

export function GuarantorSection({
  leaseId,
  guarantor,
  guarantorsCount = 0,
  canManage = true,
}: GuarantorSectionProps) {
  // ⚠ Les hooks précèdent la sortie anticipée ci-dessous : posés après, ce seraient des hooks
  // conditionnels, refusés par le React Compiler (ADR-0015).
  const t = useTranslations('lease.guarantor');
  const [open, setOpen] = useState(false);
  const disabled = guarantorsCount >= MAX_GUARANTORS;

  // TCK-173 — tenants without an existing guarantor have nothing to display.
  if (!canManage && !guarantor) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t('title')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('max', { max: String(MAX_GUARANTORS) })}
          </p>
        </div>
        {canManage && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(true)}
            disabled={disabled}
            title={disabled ? t('maxReached', { max: String(MAX_GUARANTORS) }) : undefined}
          >
            {t('add')}
          </Button>
        )}
      </div>

      {guarantor ? (
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('name')}</dt>
            <dd className="text-foreground">{guarantor.full_name}</dd>
          </div>
          {guarantor.phone && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('phone')}</dt>
              <dd className="text-foreground">{guarantor.phone}</dd>
            </div>
          )}
          {guarantor.email && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('email')}</dt>
              <dd className="text-foreground">{guarantor.email}</dd>
            </div>
          )}
          {guarantor.relationship_to_tenant && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('relationship')}</dt>
              <dd className="text-foreground">{guarantor.relationship_to_tenant}</dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          {t('empty')}
        </p>
      )}

      <GuarantorDialog
        leaseId={leaseId}
        open={open}
        onOpenChange={setOpen}
      />
    </section>
  );
}

function GuarantorDialog({
  leaseId,
  open,
  onOpenChange,
}: {
  leaseId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useTranslations('lease.guarantor');
  const tCommon = useTranslations('common');
  const createGuarantor = useCreateGuarantor(leaseId);

  const idTypeOptions = ID_TYPES.map((value) => ({ value, label: t(`idTypes.${value}`) }));

  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<
    GuarantorFormValues,
    unknown
  >({
    schema: guarantorSchema,
    defaultValues: {
      first_name: '',
      last_name: '',
      phone: '',
      email: '',
      id_type: undefined,
      id_number: '',
      occupation: '',
      employer: '',
      monthly_income: 0,
      relationship_to_tenant: '',
    },
    onSubmit: async (values) => {
      await createGuarantor.mutateAsync(values);
      return undefined;
    },
    onSuccess: () => {
      form.reset();
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('add')}</DialogTitle>
          <DialogDescription>
            {t('dialogDescription')}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-4"
        >
          <FormGlobalError>{globalError}</FormGlobalError>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput<GuarantorFormValues>
              control={form.control}
              name="first_name"
              label={t('firstName')}
              required
            />
            <FormInput<GuarantorFormValues>
              control={form.control}
              name="last_name"
              label={t('lastName')}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput<GuarantorFormValues>
              control={form.control}
              name="phone"
              label={t('phone')}
            />
            <FormInput<GuarantorFormValues>
              control={form.control}
              name="email"
              type="email"
              label={t('email')}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormSelect<GuarantorFormValues>
              control={form.control}
              name="id_type"
              label={t('idType')}
              placeholder={t('idTypePlaceholder')}
              options={idTypeOptions}
            />
            <FormInput<GuarantorFormValues>
              control={form.control}
              name="id_number"
              label={t('idNumber')}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput<GuarantorFormValues>
              control={form.control}
              name="occupation"
              label={t('occupation')}
            />
            <FormInput<GuarantorFormValues>
              control={form.control}
              name="employer"
              label={t('employer')}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput<GuarantorFormValues>
              control={form.control}
              name="monthly_income"
              type="number"
              label={t('monthlyIncome')}
              min={0}
            />
            <FormInput<GuarantorFormValues>
              control={form.control}
              name="relationship_to_tenant"
              label={t('relationshipToTenant')}
              placeholder={t('relationshipPlaceholder')}
            />
          </div>
          <FormTextarea<GuarantorFormValues>
            control={form.control}
            name="notes"
            label={t('notes')}
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {tCommon('actions.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t('adding') : t('submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
