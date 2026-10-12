'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * TCK-464 — un choix qui GOUVERNE la suite du parcours se montre, il ne se déroule pas.
 *
 * Un `<select>` cache ses options derrière un geste ; sur le type de bien, qui décide de quelles
 * étapes existent, ce coût est mal placé. Sur mobile, la pastille est aussi la seule cible
 * confortable au pouce.
 *
 * ⚠ Deux sémantiques ARIA cohabitent, choisies par `radioGroup` :
 *
 * - **`aria-pressed` (défaut)** — un groupe de boutons-bascule, chaque puce tabulable pour
 *   elle-même. Pour les choix FACULTATIFS qu'on peut désélectionner (statut foncier) et les choix
 *   MULTIPLES (équipements) : un groupe de radios ne se désélectionne pas, et n'admet qu'une
 *   valeur, donc ne convient à AUCUN des deux.
 * - **`role="radiogroup"` / `role="radio"` / `aria-checked` (`radioGroup`)** — pour un choix à
 *   sélection UNIQUE et non désélectionnable (le type de bien, le contrat) : c'est la position
 *   dans un groupe qu'un lecteur d'écran doit annoncer, pas un bouton enfoncé seize fois. Le
 *   clavier suit la même sémantique (patron *roving tabindex* de l'ARIA APG) : une seule puce dans
 *   l'ordre de tabulation, les flèches déplacent la sélection à l'intérieur du groupe. Annoncer
 *   « radio, 3 sur 16 » sans que les flèches ne fassent rien serait pire que l'ancien
 *   `aria-pressed` : une promesse de navigation qui n'existe pas.
 *
 * ⚠ Le composant ne bascule RIEN : il remonte la valeur cliquée (ou déplacée aux flèches en mode
 * radio), qu'elle soit déjà retenue ou non. C'est l'appelant qui sait si le clic ajoute, remplace
 * ou retire — trois règles différentes selon le champ, qui n'ont aucune raison de vivre ici.
 */
export type ChoiceOption = {
  readonly value: string;
  readonly label: string;
  /** Une icône Lucide (types de bien) ou l'emoji d'une étiquette servie par l'API (équipements). */
  readonly icon?: ReactNode;
  /**
   * TCK-631 — une ligne d'explication sous le libellé, rendue par la forme `cartes` seulement.
   * Elle est reliée par `aria-describedby`, JAMAIS concaténée au nom : le nom accessible de
   * « Vendre » doit rester « Vendre ».
   */
  readonly description?: string;
};

/**
 * TCK-631 — la FORME du groupe, jamais sa sémantique (qui reste celle de `radioGroup`) :
 *
 * - `pastilles` (défaut) — des pastilles qui passent à la ligne : équipements, statut foncier.
 * - `cartes` — deux ou trois grandes cartes avec une ligne d'explication : le contrat.
 * - `tuiles` — une grille de tuiles icône + libellé : les types de bien.
 */
export type ChoiceChipsVariant = 'pastilles' | 'cartes' | 'tuiles';

type ChoiceChipsCommun = {
  readonly options: readonly ChoiceOption[];
  readonly onChange: (value: string) => void;
  readonly label: string;
  readonly id: string;
  readonly variant?: ChoiceChipsVariant;
};

export type ChoiceChipsProps =
  | (ChoiceChipsCommun & {
      /** Sélection UNIQUE. */
      readonly value: string | undefined;
      readonly selected?: undefined;
      /**
       * `true` pour un choix à sélection UNIQUE et non désélectionnable (type de bien, contrat) :
       * bascule la sémantique ARIA — et le clavier — vers un groupe de radios. Défaut `false`
       * (groupe de boutons-bascule).
       *
       * N'existe que sur CETTE branche, jamais sur celle de `selected` : un groupe de radios est
       * par construction à sélection unique, donc `radioGroup` combiné à `selected` (multi-valeurs)
       * décrirait un groupe de radios à plusieurs cases cochées — un état illégal. Le type ferme
       * la combinaison plutôt que de se contenter de la documenter.
       */
      readonly radioGroup?: boolean;
    })
  | (ChoiceChipsCommun & {
      /**
       * Sélection MULTIPLE — prend le pas sur `value`, qui n'a alors pas lieu d'être passé.
       *
       * Sans elle, un appelant multi-valeurs (les équipements) devait passer `value={undefined}`
       * pour neutraliser l'état actif : plus rien ne montrait alors ce qui était déjà retenu, et
       * l'utilisateur re-cliquait pour désélectionner ce qu'il croyait absent. Une pastille
       * retenue qui ne se distingue pas n'est pas une finition manquante, c'est une information
       * perdue. Le type interdit désormais de fournir les DEUX à la fois, plutôt que de se
       * contenter de le documenter.
       */
      readonly selected: readonly string[];
      readonly value?: undefined;
      /** Toujours absent ici — cf. le commentaire sur la branche `value`. */
      readonly radioGroup?: undefined;
    });

export function ChoiceChips({
  options,
  value,
  selected,
  onChange,
  label,
  id,
  radioGroup = false,
  variant = 'pastilles',
}: ChoiceChipsProps) {
  const estRetenue = (v: string) => (selected ? selected.includes(v) : value === v);
  const boutons = useRef<Array<HTMLButtonElement | null>>([]);

  // Roving tabindex (patron ARIA APG pour un `radiogroup`) : UNE seule puce dans l'ordre de
  // tabulation — la sélectionnée, ou la première si rien ne l'est encore. N'a de sens qu'en mode
  // radio ; en `aria-pressed`, chaque puce reste tabulable pour elle-même (statut foncier,
  // équipements : multi-sélection, désélectionnables — cf. le docblock plus haut).
  const indexParDefaut = Math.max(
    options.findIndex((o) => estRetenue(o.value)),
    0,
  );

  const onKeyDownRadio = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let prochain: number;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        prochain = (index + 1) % options.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        prochain = (index - 1 + options.length) % options.length;
        break;
      case 'Home':
        prochain = 0;
        break;
      case 'End':
        prochain = options.length - 1;
        break;
      default:
        return;
    }
    // Déplacer la sélection aux flèches SÉLECTIONNE immédiatement — c'est le comportement attendu
    // d'un groupe de radios natif, pas une simple navigation du focus.
    e.preventDefault();
    onChange(options[prochain].value);
    boutons.current[prochain]?.focus();
  };

  return (
    <div>
      <p
        id={id}
        className={cn(
          variant === 'pastilles'
            ? 'mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.11em] text-muted-foreground'
            : 'mb-3 text-sm font-semibold text-foreground',
        )}
      >
        {label}
      </p>
      <div
        role={radioGroup ? 'radiogroup' : 'group'}
        aria-labelledby={id}
        className={cn(
          variant === 'pastilles' && 'flex flex-wrap gap-2',
          variant === 'cartes' && 'grid grid-cols-2 gap-3 sm:gap-4',
          variant === 'tuiles' && 'grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3 xl:grid-cols-5',
        )}
      >
        {options.map((o, index) => {
          const actif = estRetenue(o.value);
          const idDescription = o.description ? `${id}-${o.value}-description` : undefined;
          // La description vit DANS le bouton : sans `aria-labelledby`, elle entrerait dans le nom
          // calculé depuis le contenu (« Vendre Un prix demandé… » au lieu de « Vendre »).
          const idLibelle = variant === 'cartes' ? `${id}-${o.value}-libelle` : undefined;
          return (
            <button
              key={o.value}
              ref={(el) => {
                boutons.current[index] = el;
              }}
              type="button"
              role={radioGroup ? 'radio' : undefined}
              aria-checked={radioGroup ? actif : undefined}
              aria-pressed={radioGroup ? undefined : actif}
              aria-labelledby={idLibelle}
              aria-describedby={variant === 'cartes' ? idDescription : undefined}
              tabIndex={radioGroup ? (index === indexParDefaut ? 0 : -1) : undefined}
              onKeyDown={radioGroup ? (e) => onKeyDownRadio(e, index) : undefined}
              onClick={() => onChange(o.value)}
              className={cn(
                // `scale`, pas `transform` : sous Tailwind 4, `active:scale-*` écrit la propriété
                // `scale`, que la liste précédente ne faisait pas transitionner.
                'transition-[background-color,border-color,color,box-shadow,scale] duration-150 ease-out',
                'active:scale-[0.97] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                variant === 'pastilles' && [
                  // `min-h-11` = 44 px : la cible tactile minimale. En dessous, le doigt rate.
                  'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm',
                  actif
                    ? 'border-primary bg-primary font-semibold text-primary-foreground'
                    : 'border-border bg-card text-foreground hover:bg-muted',
                ],
                variant !== 'pastilles' && [
                  'relative rounded-xl border bg-card text-left text-foreground',
                  actif
                    ? 'border-primary shadow-[inset_0_0_0_1px_var(--primary)]'
                    : 'border-border hover:border-foreground/25',
                ],
                variant === 'cartes' && [
                  'flex min-h-11 flex-col items-start gap-2.5 p-3.5 sm:flex-row sm:items-center sm:gap-4 sm:p-4',
                  actif && 'shadow-[inset_0_0_0_1px_var(--primary),0_8px_24px_color-mix(in_srgb,var(--foreground)_8%,transparent)]',
                ],
                variant === 'tuiles' && [
                  'flex min-h-20 flex-col items-center justify-center gap-2 px-1.5 py-3 text-center text-sm font-medium',
                  'sm:min-h-24 sm:items-start sm:justify-between sm:p-4 sm:text-left',
                  actif && 'bg-primary/5',
                ],
              )}
            >
              {variant === 'cartes' ? (
                <>
                  {o.icon ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        'grid size-10 shrink-0 place-items-center rounded-lg transition-colors sm:size-11',
                        actif ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                      )}
                    >
                      {o.icon}
                    </span>
                  ) : null}
                  <span className="flex min-w-0 flex-col gap-0.5 pr-6">
                    <span id={idLibelle} className="font-display text-base font-semibold sm:text-lg">
                      {o.label}
                    </span>
                    {o.description ? (
                      <span id={idDescription} className="text-xs leading-snug text-muted-foreground sm:text-sm">
                        {o.description}
                      </span>
                    ) : null}
                  </span>
                </>
              ) : (
                <>
                  {/*
                    L'icône est un repère de FORME, pas un décor : elle accélère le balayage d'une
                    grille de seize types. `aria-hidden` la retire du nom accessible du bouton, qui
                    doit rester le libellé seul.
                  */}
                  {o.icon ? (
                    <span aria-hidden="true" className="inline-flex shrink-0">
                      {o.icon}
                    </span>
                  ) : null}
                  <span className={cn(variant === 'tuiles' && 'leading-tight')}>{o.label}</span>
                </>
              )}
              {variant !== 'pastilles' && actif ? (
                <span
                  aria-hidden="true"
                  className="absolute top-2 right-2 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground"
                >
                  <Check className="size-3" strokeWidth={3} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
