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
 * - le champ n'affiche que la suite (`780143710`), telle que tapée : un 0 de
 *   préfixe national reste à l'écran, il n'est retiré que de la valeur
 *   (TCK-574) ;
 * - un `+` (ou `00`) tapé en tête bascule en numéro international complet :
 *   le préfixe disparaît, c'est la voie de la diaspora ;
 * - la composition et la décomposition vivent dans `lib/phone.ts`, qui les
 *   teste une à une ;
 * - une frappe qui ne compose aucun numéro (« 0 » sous `+33`) vaut `''`, comme
 *   le champ vide : un parent qui veut la vider ne change donc pas `value`, et
 *   doit REMONTER le composant (`key`). Aucun assistant ne le fait aujourd'hui
 *   (TCK-574, repair-1).
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

  /**
   * TCK-574 — la FRAPPE est gardée telle quelle tant qu'elle compose encore la
   * valeur du parent. La valeur, elle, est normalisée (`0612…` sous `+33` →
   * `+33612…`) : dériver l'affichage de la valeur seule faisait disparaître le
   * 0 sous les doigts. Une valeur posée par le parent (brouillon, remise à zéro)
   * ne correspond plus à la frappe, et c'est alors elle qui s'affiche.
   */
  const [frappe, setFrappe] = React.useState<string | null>(null);
  const frappeCourante =
    frappe !== null && composerTelephone(frappe, indicatif) === value ? frappe : null;
  const decompose = decomposerTelephone(value, indicatif);
  const international =
    frappeCourante !== null ? /^\s*(?:\+|00)/.test(frappeCourante) : decompose.international;
  const saisie = frappeCourante ?? decompose.saisie;

  /**
   * TCK-574 — le retrait du champ suit la largeur MESURÉE du préfixe. L'estimation en `ch` le
   * surestimait (le « + » est plus étroit qu'un chiffre) : 18,5 px entre le séparateur et le
   * premier chiffre à 320/360/390 px, 17,1 px au bureau, pour 10 px de marge avant l'indicatif.
   * Elle reste la valeur du premier rendu (serveur, et jsdom qui n'a pas de mise en page).
   */
  const prefixeRef = React.useRef<HTMLSpanElement | null>(null);
  const [largeurPrefixe, setLargeurPrefixe] = React.useState<number | null>(null);
  React.useLayoutEffect(() => {
    const el = prefixeRef.current;
    if (!el) return;
    const mesurer = () => {
      const largeur = el.getBoundingClientRect().width;
      setLargeurPrefixe(largeur > 0 ? largeur : null);
    };
    mesurer();
    if (typeof ResizeObserver === 'undefined') return;
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(el);
    return () => observateur.disconnect();
  }, [international, indicatif]);

  const decrit = [international ? null : idPrefixe, idAide, descriptionExterne]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        {!international ? (
          <span
            ref={prefixeRef}
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
          onChange={(e) => {
            setFrappe(e.target.value);
            onValueChange(composerTelephone(e.target.value, indicatif));
          }}
          aria-describedby={decrit}
          className={cn('tabular-nums', className)}
          style={
            international
              ? undefined
              : {
                  // Même marge (`pl-2.5`) après le séparateur qu'avant l'indicatif.
                  paddingInlineStart:
                    largeurPrefixe !== null
                      ? `calc(${largeurPrefixe}px + 0.625rem)`
                      : `calc(${indicatif.length}ch + 1.625rem)`,
                }
          }
        />
      </div>
      <p id={idAide} className="text-xs text-pretty text-muted-foreground">
        {international ? t('hintInternational') : t('hintNational', { indicatif })}
      </p>
    </div>
  );
}
