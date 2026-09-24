'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  INDICATIF_PAR_DEFAUT,
  composerTelephone,
  decomposerTelephone,
} from '@/lib/phone';

/**
 * TCK-566 — saisie d'un numéro de téléphone, INDICATIF EN PRÉFIXE.
 *
 * ⚠ Le défaut qu'il remplace : l'assistant « Publier votre premier bien »
 * amorçait un `<Input>` ordinaire avec la VALEUR `+221`. Un clic en tête du
 * champ, et les chiffres tapés s'inséraient AVANT l'indicatif — `78|+221` à
 * l'écran, `780143710+221` au récapitulatif puis en base. Aucun déplacement de
 * curseur ne ferme ce défaut : un collage, une flèche, un clic le rouvrent.
 * L'indicatif sort donc de la valeur éditable ; il est affiché, jamais tapé.
 *
 * Contrat :
 * - `value` / `onValueChange` portent la valeur COMPLÈTE (`+221780143710`),
 *   ou `''` tant que rien n'est tapé — jamais un indicatif seul ;
 * - le champ n'affiche que la suite (`780143710`) ;
 * - un `+` (ou `00`) tapé en tête bascule en numéro international complet :
 *   le préfixe disparaît, c'est la voie de la diaspora ;
 * - la composition et la décomposition vivent dans `lib/phone.ts`, qui les
 *   teste une à une.
 */
export interface PhoneInputProps
  extends Omit<React.ComponentProps<'input'>, 'value' | 'defaultValue' | 'onChange' | 'type'> {
  /** Valeur complète, E.164 (`+221780143710`), ou `''`. */
  readonly value: string;
  readonly onValueChange: (valeur: string) => void;
  /** Indicatif affiché en préfixe (`+221` par défaut). */
  readonly indicatif?: string;
}

export function PhoneInput({
  value,
  onValueChange,
  indicatif = INDICATIF_PAR_DEFAUT,
  id,
  className,
  disabled,
  'aria-describedby': descriptionExterne,
  ...props
}: PhoneInputProps) {
  const t = useTranslations('ui.phoneInput');
  const idAuto = React.useId();
  const base = id ?? idAuto;
  const idPrefixe = `${base}-indicatif`;
  const idAide = `${base}-aide`;

  const { international, saisie } = decomposerTelephone(value, indicatif);

  const decrit = [international ? null : idPrefixe, idAide, descriptionExterne]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        {!international ? (
          <span
            id={idPrefixe}
            className={cn(
              // Même corps que le champ (`text-base md:text-sm`) : l'alignement du
              // retrait ci-dessous, exprimé en `ch`, en dépend.
              'pointer-events-none absolute inset-y-0 left-0 my-2 flex items-center border-r border-border pr-2 pl-2.5 text-base text-muted-foreground tabular-nums md:text-sm',
              disabled && 'opacity-50',
            )}
          >
            {indicatif}
          </span>
        ) : null}
        <Input
          {...props}
          id={id ?? idAuto}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          disabled={disabled}
          value={saisie}
          onChange={(e) => onValueChange(composerTelephone(e.target.value, indicatif))}
          aria-describedby={decrit}
          className={cn('tabular-nums', className)}
          style={
            international
              ? undefined
              : { paddingInlineStart: `calc(${indicatif.length}ch + 1.625rem)` }
          }
        />
      </div>
      <p id={idAide} className="text-xs text-pretty text-muted-foreground">
        {international ? t('hintInternational') : t('hintNational', { indicatif })}
      </p>
    </div>
  );
}
