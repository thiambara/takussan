'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Controller, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { FormAmountInput, FormGlobalError, FormTextarea } from '@/components/forms';
import { useApiForm } from '@/hooks/useApiForm';
import { decalerJour } from '@/lib/jour-de-l-api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useContreProposer } from '@/lib/queries/booking-counter-offer';
// TCK-2877 — le schéma vit sous `lib/schemas/` : la garde des traducteurs (traducteurs-de-messages)
// rougissait sur l'appel de `msgValidation` ici, hors des schémas.
import { contreOffreSchema as schema, VALIDITES_DE_CONTRE_OFFRE, type ContreOffreFormValues } from '@/lib/schemas/booking';
import { jourADakar } from '@/lib/visites/par-le-temps';
import type { BookingCounterOffer } from '@/types/booking';
import { FeuilleOuPanneau, PastillesDeChoix, useEnPanneau } from './pieces-des-feuilles';

/** Les validités proposées, en jours (l'API admet d'aujourd'hui à J+30 ; J+3 par défaut). */
export const VALIDITES = VALIDITES_DE_CONTRE_OFFRE;
type Validite = (typeof VALIDITES)[number];
type Valeurs = ContreOffreFormValues;

interface FeuilleDeContreOffreProps {
  readonly bookingId: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Le prix affiché du bien : le montant prérempli d'une première contre-offre. */
  readonly prixAffiche: number | null;
  /** La contre-offre ouverte qu'on modifie : son montant et son message sont repris. */
  readonly enCours: BookingCounterOffer | null;
  readonly devise: string;
  readonly maintenant: Date;
  readonly onEnvoyee: () => void;
}

/**
 * TCK-2876 (ADR-0110 § 5) — « Contre-proposer » sur une offre d'achat : la feuille du bas au
 * téléphone, le panneau droit dès `xl`, comme les autres feuilles de la fiche. Non dessinée par la
 * maquette : montant (prérempli du prix affiché, ou de la contre-offre qu'on modifie), message
 * facultatif, validité en pastilles (3 jours par défaut) ; le bouton dit le montant qu'il propose.
 *
 * La validité part au serveur comme un JOUR de Dakar (`valid_until`), jamais un instant.
 * L'erreur de l'API se dit dans la feuille, qui reste ouverte (ADR-0019).
 */
export function FeuilleDeContreOffre({ bookingId, open, onOpenChange, prixAffiche, enCours, devise, maintenant, onEnvoyee }: FeuilleDeContreOffreProps) {
  const t = useTranslations('bookings.feuilles.contreOffre');
  const f = useFormatteurs();
  const panneau = useEnPanneau();
  const formId = useId();
  const contreProposer = useContreProposer(bookingId);
  const aujourdHui = jourADakar(maintenant);
  const prerempli = enCours?.amount ?? prixAffiche ?? undefined;

  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<Valeurs, unknown>({
    schema,
    defaultValues: {
      amount: prerempli !== undefined && prerempli > 0 ? Math.round(prerempli) : undefined,
      message: enCours?.message ?? '',
      validite: '3',
    },
    onSubmit: async ({ amount, message, validite }) => {
      await contreProposer.mutateAsync({
        amount,
        ...(message ? { message } : {}),
        valid_until: decalerJour(aujourdHui, Number(validite)),
      });
      return undefined;
    },
    onSuccess: () => {
      onEnvoyee();
      onOpenChange(false);
    },
  });

  const montant = useWatch({ control: form.control, name: 'amount' });
  const validite = useWatch({ control: form.control, name: 'validite' });
  const jusquAu = f.date(`${decalerJour(aujourdHui, Number(validite))}T12:00:00Z`, {
    dateStyle: undefined,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const pied = (
    <Button type="submit" form={formId} size={panneau ? 'default' : 'xl'} className={panneau ? undefined : 'w-full'} disabled={isSubmitting}>
      {isSubmitting
        ? t('envoi')
        : typeof montant === 'number' && montant > 0
          ? t('envoyerMontant', { montant: f.montantCourt(montant, devise) })
          : t('envoyer')}
    </Button>
  );

  return (
    <FeuilleOuPanneau open={open} onOpenChange={onOpenChange} titre={t('titre', { modifier: enCours ? 'oui' : 'non' })} pied={pied}>
      <form
        id={formId}
        data-slot="feuille-de-contre-offre"
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        className="space-y-4 pt-1"
      >
        <FormGlobalError>{globalError}</FormGlobalError>
        <div>
          <FormAmountInput<Valeurs> control={form.control} name="amount" label={t('montant')} currency={devise} unite="F" required />
          <p className="mt-1 text-xs text-muted-foreground">{t(enCours ? 'montantAideEnCours' : 'montantAide')}</p>
        </div>
        <Controller
          control={form.control}
          name="validite"
          render={({ field }) => (
            <PastillesDeChoix<Validite>
              libelle={t('validite')}
              options={VALIDITES.map((v) => ({ valeur: v, libelle: t('jours', { n: Number(v) }) }))}
              valeur={field.value}
              onChange={field.onChange}
              aide={t('jusquAu', { date: jusquAu })}
            />
          )}
        />
        <FormTextarea<Valeurs> control={form.control} name="message" label={t('message')} placeholder={t('messagePlaceholder')} rows={3} maxLength={500} />
        <p className="text-ui leading-snug text-muted-foreground">{t('prevenu')}</p>
      </form>
    </FeuilleOuPanneau>
  );
}
