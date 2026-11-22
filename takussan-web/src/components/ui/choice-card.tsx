'use client';

import { cn } from '@/lib/utils';

/**
 * Choix exclusif présenté en carte — la forme « une question, deux ou trois
 * réponses » des assistants d'onboarding.
 *
 * ⚠ Pourquoi une primitive plutôt qu'un `<input type="radio">` posé à la main :
 * un radio natif se peint avec l'`accent-color` du système, c'est-à-dire le
 * BLEU du navigateur. Sur la palette Lin, c'était la seule tache bleue de
 * l'écran — et elle tombait sur l'élément le plus regardé de la page, celui qui
 * dit quel choix est retenu. Quatre surfaces du dépôt roulaient leur propre
 * radio ; celle-ci est la forme partagée.
 *
 * L'input reste natif et présent (`sr-only`) : la navigation au clavier d'un
 * groupe de radios (flèches, boucle, un seul arrêt de tabulation) est un
 * comportement du navigateur qu'aucune réimplémentation ne rend gratuitement.
 * Seule sa PEINTURE est reprise, via `has-[input:focus-visible]` et l'état
 * `checked` transmis par l'appelant. `choice-card.test.tsx` éprouve cette
 * propriété — c'est celle qu'une refonte visuelle casserait sans le voir.
 *
 * ⚠ À ne pas confondre avec `property-form/wizard/ChoiceChips.tsx` (TCK-464),
 * qui sert des choix FACULTATIFS et MULTIPLES et emploie donc `aria-pressed` :
 * un groupe de radios ne se désélectionne pas et n'admet qu'une valeur.
 */
export type ChoiceCardProps = {
  readonly name: string;
  readonly value: string;
  readonly checked: boolean;
  readonly onSelect: (value: string) => void;
  readonly title: string;
  readonly description?: string;
  /** Rendu à gauche du titre — une icône `lucide` en `size-5`, par exemple. */
  readonly icon?: React.ReactNode;
  /** Contenu révélé sous la carte quand elle est retenue (avertissement, champ dépendant). */
  readonly children?: React.ReactNode;
  readonly disabled?: boolean;
  readonly className?: string;
};

export function ChoiceCard({
  name,
  value,
  checked,
  onSelect,
  title,
  description,
  icon,
  children,
  disabled = false,
  className,
}: ChoiceCardProps) {
  return (
    <div className={cn('flex flex-col', className)}>
      <label
        className={cn(
          'group relative flex cursor-pointer items-start gap-3 rounded-xl border p-4',
          // TCK-2688 — la carte de la maquette sous la portée `/app` (aucun appelant n'y est encore :
          // les deux de l'onboarding restent hors portée, inchangés).
          'portee-app:min-h-16 portee-app:items-center portee-app:px-3.5 portee-app:py-3',
          'transition-[background-color,border-color] duration-150 ease-out',
          // L'état retenu se dit par la bordure ET un aplat de sa propre encre :
          // pas d'ombre portée en plus (bordure + ombre large sur le même
          // élément est la carte-fantôme que les directives refusent).
          checked
            ? 'border-primary bg-primary/[0.06] portee-app:bg-card portee-app:ring-3 portee-app:ring-primary/12'
            : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40',
          disabled && 'cursor-not-allowed opacity-50',
          // Le focus se peint sur la CARTE, l'input étant hors flux visuel.
          'has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring',
        )}
      >
        <input
          type="radio"
          name={name}
          value={value}
          checked={checked}
          disabled={disabled}
          onChange={() => onSelect(value)}
          className="sr-only"
        />

        <span
          aria-hidden
          className={cn(
            'mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border-2',
            'portee-app:mt-0 portee-app:size-5 portee-app:border',
            'transition-colors duration-150 ease-out',
            checked
              ? 'border-primary'
              : 'border-muted-foreground/40 portee-app:border-controle-vide group-hover:border-primary/50',
          )}
        >
          <span
            className={cn(
              'size-2 rounded-full bg-primary portee-app:size-2.5',
              'transition-transform duration-150 ease-out',
              checked ? 'scale-100' : 'scale-0',
            )}
          />
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-1 portee-app:gap-0 portee-app:leading-snug">
          <span className="flex items-center gap-2 font-medium text-foreground portee-app:text-corps portee-app:font-semibold">
            {icon ? (
              <span className={cn('shrink-0', checked ? 'text-primary' : 'text-muted-foreground')}>
                {icon}
              </span>
            ) : null}
            {title}
          </span>
          {description ? (
            <span className="text-sm leading-relaxed text-muted-foreground portee-app:text-ui portee-app:leading-snug">
              {description}
            </span>
          ) : null}
        </span>
      </label>

      {checked && children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

/**
 * Groupe de `ChoiceCard`. Porte le `fieldset`/`legend` — un groupe de radios
 * sans intitulé de groupe est annoncé « radio, 1 sur 2 » sans dire de quoi.
 */
export function ChoiceCardGroup({
  legend,
  children,
  className,
}: {
  readonly legend: string;
  readonly children: React.ReactNode;
  readonly className?: string;
}) {
  return (
    <fieldset className={cn('flex flex-col gap-3', className)}>
      <legend className="sr-only">{legend}</legend>
      {children}
    </fieldset>
  );
}
