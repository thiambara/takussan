'use client';

import { useState } from 'react';
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

const ID_TYPE_OPTIONS = [
  { value: 'id_card', label: 'CNI' },
  { value: 'passport', label: 'Passeport' },
  { value: 'driving_license', label: 'Permis de conduire' },
];

const MAX_GUARANTORS = 3;

export function GuarantorSection({
  leaseId,
  guarantor,
  guarantorsCount = 0,
  canManage = true,
}: GuarantorSectionProps) {
  const [open, setOpen] = useState(false);
  const disabled = guarantorsCount >= MAX_GUARANTORS;

  // TCK-173 — tenants without an existing guarantor have nothing to display.
  if (!canManage && !guarantor) return null;

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-stone-900">Garants</h2>
          <p className="mt-1 text-xs text-stone-500">
            Maximum {MAX_GUARANTORS} garants par bail.
          </p>
        </div>
        {canManage && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(true)}
            disabled={disabled}
            title={disabled ? 'Maximum 3 garants atteint' : undefined}
          >
            Ajouter un garant
          </Button>
        )}
      </div>

      {guarantor ? (
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-500">Nom</dt>
            <dd className="text-stone-900">{guarantor.full_name}</dd>
          </div>
          {guarantor.phone && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-stone-500">Téléphone</dt>
              <dd className="text-stone-900">{guarantor.phone}</dd>
            </div>
          )}
          {guarantor.email && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-stone-500">Email</dt>
              <dd className="text-stone-900">{guarantor.email}</dd>
            </div>
          )}
          {guarantor.relationship_to_tenant && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-stone-500">Lien</dt>
              <dd className="text-stone-900">{guarantor.relationship_to_tenant}</dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="mt-4 text-sm text-stone-500">
          Aucun garant attaché à ce bail.
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
  const createGuarantor = useCreateGuarantor(leaseId);

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
          <DialogTitle>Ajouter un garant</DialogTitle>
          <DialogDescription>
            Documents justificatifs (CNI, fiche de paie) uploadables
            depuis la fiche garant après création.
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
              label="Prénom"
              required
            />
            <FormInput<GuarantorFormValues>
              control={form.control}
              name="last_name"
              label="Nom"
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput<GuarantorFormValues>
              control={form.control}
              name="phone"
              label="Téléphone"
            />
            <FormInput<GuarantorFormValues>
              control={form.control}
              name="email"
              type="email"
              label="Email"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormSelect<GuarantorFormValues>
              control={form.control}
              name="id_type"
              label="Pièce d'identité"
              placeholder="Choisir…"
              options={ID_TYPE_OPTIONS}
            />
            <FormInput<GuarantorFormValues>
              control={form.control}
              name="id_number"
              label="Numéro de pièce"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput<GuarantorFormValues>
              control={form.control}
              name="occupation"
              label="Profession"
            />
            <FormInput<GuarantorFormValues>
              control={form.control}
              name="employer"
              label="Employeur"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput<GuarantorFormValues>
              control={form.control}
              name="monthly_income"
              type="number"
              label="Revenu mensuel"
              min={0}
            />
            <FormInput<GuarantorFormValues>
              control={form.control}
              name="relationship_to_tenant"
              label="Lien avec le locataire"
              placeholder="Parent, conjoint, employeur…"
            />
          </div>
          <FormTextarea<GuarantorFormValues>
            control={form.control}
            name="notes"
            label="Notes (optionnel)"
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Ajout…' : 'Ajouter'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
