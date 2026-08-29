'use client';

import { useRef, type KeyboardEvent } from 'react';

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
  readonly icon?: string;
};

type ChoiceChipsCommun = {
  readonly options: readonly ChoiceOption[];
  readonly onChange: (value: string) => void;
  readonly label: string;
  readonly id: string;
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
        className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.11em] text-muted-foreground"
      >
        {label}
      </p>
      <div
        role={radioGroup ? 'radiogroup' : 'group'}
        aria-labelledby={id}
        className="flex flex-wrap gap-2"
      >
        {options.map((o, index) => {
          const actif = estRetenue(o.value);
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
              tabIndex={radioGroup ? (index === indexParDefaut ? 0 : -1) : undefined}
              onKeyDown={radioGroup ? (e) => onKeyDownRadio(e, index) : undefined}
              onClick={() => onChange(o.value)}
              className={cn(
                // `min-h-11` = 44 px : la cible tactile minimale. En dessous, le doigt rate.
                'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm',
                'transition-[background-color,border-color,color,transform] duration-150',
                'active:scale-[0.95] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                actif
                  ? 'border-primary bg-primary font-semibold text-primary-foreground'
                  : 'border-border bg-card text-foreground hover:bg-muted',
              )}
            >
              {/*
                L'emoji est un repère de FORME, pas un décor : il accélère le balayage d'une
                grille de seize types. `aria-hidden` le retire du nom accessible du bouton, qui
                doit rester le libellé seul.
              */}
              {o.icon ? <span aria-hidden="true">{o.icon}</span> : null}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
