'use client';

import * as React from 'react';
import { useLocale } from 'next-intl';
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';

import { Input } from '@/components/ui/input';
import type { Locale } from '@/i18n/config';
import { formatNumber } from '@/lib/format';
import {
  decimalesDeDevise,
  ecrireMontant,
  lireSaisie,
  positionApresReecriture,
  versMontant,
} from '@/lib/format/saisie-montant';
import { cn } from '@/lib/utils';
import { FormError } from './FormError';

type NativeInputProps = Omit<
  React.ComponentProps<'input'>,
  | 'name'
  | 'defaultValue'
  | 'value'
  | 'onChange'
  | 'onBlur'
  | 'ref'
  | 'type'
  | 'inputMode'
  | 'placeholder'
  | 'min'
  | 'max'
  | 'step'
>;

export type FormAmountInputProps<TFieldValues extends FieldValues> = NativeInputProps & {
  readonly name: FieldPath<TFieldValues>;
  readonly control: ControllerProps<TFieldValues>['control'];
  readonly label?: React.ReactNode;
  /**
   * Code ISO de la devise du montant (`XOF`, `EUR`…). Il décide des décimales admises : aucune
   * pour le franc CFA, deux pour l'euro. Défaut : XOF.
   */
  readonly currency?: string | null;
  /**
   * Un montant d'EXEMPLE, affiché en indication — formaté comme le serait la saisie. Un nombre et
   * non un texte : écrit dans un dictionnaire, « 25000000 » ne suivait pas la locale.
   */
  readonly example?: number;
  /** Classe du conteneur externe. */
  readonly containerClassName?: string;
};

/**
 * TCK-564 — un montant qui se RELIT pendant qu'on le tape : « 49 000 000 », pas « 49000000 ».
 *
 * Même habillage que `FormInput` (libellé, astérisque, erreur reliée par `aria-describedby`,
 * primitive `Input` et donc la densité confortable du parcours), mais un champ TEXTE au clavier
 * numérique : `<input type="number">` refuse d'afficher le moindre séparateur. Les conversions
 * vivent dans `lib/format/saisie-montant.ts`, pures et testées pour elles-mêmes.
 *
 * ⚠ Le formulaire reçoit un NOMBRE — jamais le texte groupé. C'est ce nombre qui part à l'API.
 *
 * ⚠ Un champ VIDÉ rend `null`, pas `undefined` : react-hook-form lit `undefined` comme « aucune
 * valeur » et ré-affiche alors la valeur PAR DÉFAUT du formulaire — sur la page d'édition, l'ancien
 * prix reparaissait sous le doigt qui venait de l'effacer (mesuré par le test). `null` passe par
 * `z.coerce.number` comme la chaîne vide de l'ancien `type="number"` : même message d'erreur.
 */
export function FormAmountInput<TFieldValues extends FieldValues>({
  name,
  control,
  label,
  id,
  currency,
  example,
  className,
  containerClassName,
  required,
  ...inputProps
}: FormAmountInputProps<TFieldValues>) {
  const inputId = id ?? `field-${String(name)}`;
  const errorId = `${inputId}-error`;

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => {
        const hasError = Boolean(fieldState.error);
        return (
          <div className={cn('w-full', containerClassName)}>
            {label ? (
              <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium">
                {label}
                {required ? <span aria-hidden="true" className="ml-0.5 text-destructive">*</span> : null}
              </label>
            ) : null}
            <ChampMontant
              {...inputProps}
              valeurDuFormulaire={field.value}
              nom={field.name}
              surValeur={field.onChange}
              surSortie={field.onBlur}
              refDuFormulaire={field.ref}
              id={inputId}
              hasError={hasError}
              errorId={errorId}
              required={required}
              decimales={decimalesDeDevise(currency ?? 'XOF')}
              example={example}
              className={className}
            />
            <FormError id={errorId}>{fieldState.error?.message}</FormError>
          </div>
        );
      }}
    />
  );
}

type ChampMontantProps = NativeInputProps & {
  /** Ce que le formulaire porte — un nombre, `null`, ou la chaîne d'un brouillon ancien. */
  readonly valeurDuFormulaire: unknown;
  readonly nom: string;
  readonly surValeur: (valeur: number | null) => void;
  readonly surSortie: () => void;
  readonly refDuFormulaire: (el: HTMLInputElement | null) => void;
  readonly id: string;
  readonly hasError: boolean;
  readonly errorId: string;
  readonly decimales: number;
  readonly example?: number;
};

/**
 * La saisie elle-même. Un composant à part parce qu'il porte un ÉTAT — le texte en cours de
 * frappe — qu'une fonction de rendu de `Controller` ne peut pas tenir.
 */
function ChampMontant({
  valeurDuFormulaire,
  nom,
  surValeur,
  surSortie,
  refDuFormulaire,
  id,
  hasError,
  errorId,
  required,
  decimales,
  example,
  className,
  ...inputProps
}: ChampMontantProps) {
  const locale = useLocale() as Locale;
  const champ = React.useRef<HTMLInputElement | null>(null);
  const curseur = React.useRef<number | null>(null);

  /**
   * Le texte TAPÉ, gardé tel quel tant qu'il décrit la valeur du formulaire. Il faut le garder :
   * « 1 500, » (une virgule qu'on vient de taper, en euros) vaut 1500, et le réécrire depuis la
   * valeur effacerait la virgule sous le doigt.
   *
   * Dès que la valeur change AILLEURS (brouillon repris, `reset`), elle ne correspond plus au
   * texte : l'affichage repart de la valeur. Décidé pendant le rendu, sans effet — c'est une
   * donnée dérivée, pas un état à synchroniser.
   */
  const [saisie, setSaisie] = React.useState<string | null>(null);
  const valeur = versMontant(valeurDuFormulaire);
  const affichage =
    saisie !== null && lireSaisie(saisie, decimales, locale).valeur === valeur
      ? saisie
      : ecrireMontant(valeur, decimales, locale);

  // Le curseur se replace APRÈS que React a écrit la nouvelle valeur dans le champ — jamais avant,
  // où l'écriture le renverrait en fin de champ.
  React.useLayoutEffect(() => {
    const position = curseur.current;
    curseur.current = null;
    const el = champ.current;
    if (position === null || !el || el.ownerDocument.activeElement !== el) return;
    el.setSelectionRange(position, position);
  });

  return (
    <Input
      {...inputProps}
      id={id}
      type="text"
      inputMode={decimales > 0 ? 'decimal' : 'numeric'}
      autoComplete="off"
      aria-invalid={hasError || undefined}
      aria-describedby={hasError ? errorId : undefined}
      aria-required={required || undefined}
      // Chiffres à chasse fixe : un montant qui se regroupe sous le doigt ne doit pas danser.
      className={cn('tabular-nums', className)}
      placeholder={
        example === undefined ? undefined : formatNumber(example, locale, { maximumFractionDigits: 0 })
      }
      value={affichage}
      name={nom}
      ref={(el) => {
        champ.current = el;
        refDuFormulaire(el);
      }}
      onChange={(e) => {
        const brut = e.target.value;
        const lu = lireSaisie(brut, decimales, locale);
        curseur.current = positionApresReecriture(
          brut,
          e.target.selectionStart ?? brut.length,
          lu.affichage,
          locale,
        );
        setSaisie(lu.affichage);
        surValeur(lu.valeur ?? null);
      }}
      onBlur={() => {
        // En quittant le champ, une virgule restée en suspens (« 1 500, ») disparaît : l'affichage
        // repart de la valeur retenue.
        setSaisie(null);
        surSortie();
      }}
    />
  );
}
