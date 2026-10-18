'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Controller } from 'react-hook-form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  FormError,
  FormInput,
  FormSelect,
  FormTextarea,
  FormGlobalError,
} from '@/components/forms';
import { PhoneInput } from '@/components/ui/phone-input';
import { useApiForm } from '@/hooks/useApiForm';
import { useCreateGuarantor, useLeaseGuarantors } from '@/lib/queries/leases';
import { guarantorSchema, type GuarantorFormValues } from '@/lib/schemas/lease';

interface GuarantorSectionProps {
  readonly leaseId: number;
  /** TCK-173 — false hides the add button for tenants. */
  readonly canManage?: boolean;
}

/** Valeurs d'enum ; les libellés vivent sous `lease.guarantor.idTypes.*`. */
const ID_TYPES = ['id_card', 'passport', 'driving_license'] as const;

const MAX_GUARANTORS = 3;

export function GuarantorSection({
  leaseId,
  canManage = true,
}: GuarantorSectionProps) {
  // ⚠ Les hooks précèdent la sortie anticipée ci-dessous : posés après, ce seraient des hooks
  // conditionnels, refusés par le React Compiler (ADR-0015).
  const t = useTranslations('lease.guarantor');
  const [open, setOpen] = useState(false);
  // TCK-695 — les garants du bail sont ceux du pivot `lease_guarantor`, lus par leur route :
  // `GET /api/leases/{id}` n'en émet aucun, et l'ajout n'écrit pas `leases.guarantor_id`.
  const guarantorsQuery = useLeaseGuarantors(leaseId);
  const guarantors = guarantorsQuery.data?.data ?? [];
  // Trois garants au plus par bail (TCK-044) : le serveur tient la borne, le bouton la reflète.
  const disabled = guarantors.length >= MAX_GUARANTORS;

  // TCK-173 — tenants without an existing guarantor have nothing to display.
  if (!canManage && guarantors.length === 0) return null;

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

      {guarantors.length > 0 ? (
        <ul className="mt-4 divide-y divide-border">
          {guarantors.map((guarantor) => (
            <li key={guarantor.id} className="py-3 first:pt-0 last:pb-0">
              <dl className="grid gap-2 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('name')}</dt>
                  <dd className="text-foreground">{`${guarantor.first_name} ${guarantor.last_name}`}</dd>
                </div>
                {guarantor.phone && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('phone')}</dt>
                    <dd className="text-foreground">
                      {/* TCK-913 — un appui appelle le garant, depuis la fiche du bail. */}
                      <a
                        href={`tel:${guarantor.phone.replace(/\s+/g, '')}`}
                        className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {guarantor.phone}
                      </a>
                    </dd>
                  </div>
                )}
                {guarantor.email && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('email')}</dt>
                    <dd className="text-foreground">{guarantor.email}</dd>
                  </div>
                )}
              </dl>
            </li>
          ))}
        </ul>
      ) : guarantorsQuery.isLoading ? null : (
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
            {/* TCK-913 — `PhoneInput` : clavier téléphonique, indicatif en préfixe, valeur E.164. */}
            <Controller
              control={form.control}
              name="phone"
              render={({ field, fieldState }) => (
                <div className="w-full">
                  <label htmlFor="field-phone" className="mb-1.5 block text-sm font-medium">
                    {t('phone')}
                  </label>
                  <PhoneInput
                    id="field-phone"
                    name={field.name}
                    value={field.value ?? ''}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                    ref={field.ref}
                    aria-invalid={fieldState.error ? true : undefined}
                    aria-describedby={fieldState.error ? 'field-phone-error' : undefined}
                  />
                  <FormError id="field-phone-error">{fieldState.error?.message}</FormError>
                </div>
              )}
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
