'use client';

import { useId } from 'react';
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Controller, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { FormAmountInput, FormGlobalError, FormInput, FormTextarea } from '@/components/forms';
import { useApiForm } from '@/hooks/useApiForm';
import { useCreateBookingPayment } from '@/lib/queries/bookings';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { bookingPaymentSchema, type BookingPaymentFormValues } from '@/lib/schemas/booking';
import { FeuilleOuPanneau, PastillesDeChoix, useEnPanneau } from './feuilles/pieces-des-feuilles';

interface BookingPaymentDialogProps {
  readonly bookingId: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** TCK-2594 — ce qui reste à encaisser : le montant prérempli (« Le solde restant, prérempli »). */
  readonly restant?: number | null;
  /** Le type proposé d'abord : le solde une fois l'acompte réglé, l'acompte sinon. */
  readonly typeParDefaut?: BookingPaymentFormValues['payment_type'];
  readonly devise?: string | null;
}

/** L'ordre de la maquette (le mobile d'abord), puis les moyens qu'elle ne montre pas. */
const MOYENS = ['orange_money', 'wave', 'cash', 'bank_transfer', 'check', 'free_money', 'mobile_money', 'card'] as const;
const TYPES = ['deposit', 'advance', 'fee'] as const;
/** Les moyens dont la référence est le numéro d'une transaction : l'aide le nomme. */
const MOYENS_A_TRANSACTION = new Set<string>(['orange_money', 'wave', 'free_money', 'mobile_money', 'card', 'bank_transfer']);

/**
 * TCK-2594 — « Enregistrer un paiement » (maquette `app-reservations` a, écran du même nom) : la
 * feuille du bas au téléphone, le panneau droit dès `xl`. Montant prérempli du reste à encaisser,
 * type et moyen en pastilles (les huit moyens de l'API, en clair), référence, notes ; le bouton dit
 * le montant qu'il enregistre.
 */
export function BookingPaymentDialog({ bookingId, open, onOpenChange, restant = null, typeParDefaut = 'deposit', devise = 'XOF' }: BookingPaymentDialogProps) {
  const t = useTranslations('bookings.feuilles.paiement');
  const tTypes = useTranslations('bookings.paymentType');
  const tMoyens = useTranslations('payments.methods');
  const f = useFormatteurs();
  const panneau = useEnPanneau();
  const formId = useId();
  const createPayment = useCreateBookingPayment(bookingId);
  const prerempli = restant !== null && restant > 0 ? restant : undefined;

  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<BookingPaymentFormValues, unknown>({
    schema: bookingPaymentSchema,
    defaultValues: {
      amount: prerempli,
      payment_method: 'cash',
      payment_type: typeParDefaut,
      transaction_id: '',
      notes: '',
    },
    onSubmit: async (values) => {
      await createPayment.mutateAsync(values);
      return undefined;
    },
    onSuccess: () => {
      form.reset();
      onOpenChange(false);
    },
  });

  const montant = useWatch({ control: form.control, name: 'amount' });
  const moyen = useWatch({ control: form.control, name: 'payment_method' });

  const pied = (
    <Button type="submit" form={formId} size={panneau ? 'default' : 'xl'} className={panneau ? undefined : 'w-full'} disabled={isSubmitting}>
      {isSubmitting
        ? t('enregistrement')
        : typeof montant === 'number' && montant > 0
          ? t('enregistrerMontant', { montant: f.montantCourt(montant, devise) })
          : t('enregistrer')}
    </Button>
  );

  return (
    <FeuilleOuPanneau open={open} onOpenChange={onOpenChange} titre={t('titre')} pied={pied}>
      <form
        id={formId}
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        className="space-y-4 pt-1"
      >
        <FormGlobalError>{globalError}</FormGlobalError>
        <div>
          <FormAmountInput<BookingPaymentFormValues> control={form.control} name="amount" label={t('montant')} currency={devise} unite="F" required />
          {prerempli !== undefined ? <p className="mt-1 text-xs text-muted-foreground">{t('montantAide')}</p> : null}
        </div>
        <Controller
          control={form.control}
          name="payment_type"
          render={({ field }) => (
            <PastillesDeChoix
              libelle={t('type')}
              options={TYPES.map((v) => ({ valeur: v, libelle: tTypes(v) }))}
              valeur={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={form.control}
          name="payment_method"
          render={({ field }) => (
            <PastillesDeChoix
              libelle={t('moyen')}
              options={MOYENS.map((v) => ({ valeur: v, libelle: tMoyens(v) }))}
              valeur={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <div>
          <FormInput<BookingPaymentFormValues> control={form.control} name="transaction_id" label={t('reference')} />
          <p className="mt-1 text-xs text-muted-foreground">
            {MOYENS_A_TRANSACTION.has(moyen) ? t('referenceAide', { moyen: tMoyens(moyen) }) : moyen === 'check' ? t('referenceCheque') : t('referenceFacultative')}
          </p>
        </div>
        <FormTextarea<BookingPaymentFormValues> control={form.control} name="notes" label={t('notes')} placeholder={t('notesPlaceholder')} rows={2} />
        <p className="flex gap-2 text-ui leading-snug text-muted-foreground">
          <Info className="mt-0.5 size-4 flex-none" strokeWidth={1.75} aria-hidden="true" />
          {t('recu')}
        </p>
      </form>
    </FeuilleOuPanneau>
  );
}
