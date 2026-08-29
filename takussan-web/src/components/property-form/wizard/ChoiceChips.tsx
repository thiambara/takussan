'use client';

import { cn } from '@/lib/utils';

/**
 * TCK-464 — un choix qui GOUVERNE la suite du parcours se montre, il ne se déroule pas.
 *
 * Un `<select>` cache ses options derrière un geste ; sur le type de bien, qui décide de quelles
 * étapes existent, ce coût est mal placé. Sur mobile, la pastille est aussi la seule cible
 * confortable au pouce.
 *
 * `aria-pressed` et non `role="radio"` : le composant sert aussi à des choix facultatifs qu'on
 * peut désélectionner (statut foncier) et à des choix MULTIPLES (les équipements) — or un groupe
 * de radios ne se désélectionne pas, et n'admet qu'une valeur.
 *
 * ⚠ Le composant ne bascule RIEN : il remonte la valeur cliquée, enfoncée ou non. C'est l'appelant
 * qui sait si le clic ajoute, remplace ou retire — trois règles différentes selon le champ, qui
 * n'ont aucune raison de vivre ici.
 */
export type ChoiceOption = {
  readonly value: string;
  readonly label: string;
  readonly icon?: string;
};

export type ChoiceChipsProps = {
  readonly options: readonly ChoiceOption[];
  /** Sélection UNIQUE. Ignoré dès que `selected` est fourni. */
  readonly value: string | undefined;
  /**
   * Sélection MULTIPLE — prend le pas sur `value`.
   *
   * Sans elle, un appelant multi-valeurs (les équipements) devait passer `value={undefined}` pour
   * neutraliser l'état actif : plus rien ne montrait alors ce qui était déjà retenu, et
   * l'utilisateur re-cliquait pour désélectionner ce qu'il croyait absent. Une pastille retenue
   * qui ne se distingue pas n'est pas une finition manquante, c'est une information perdue.
   */
  readonly selected?: readonly string[];
  readonly onChange: (value: string) => void;
  readonly label: string;
  readonly id: string;
};

export function ChoiceChips({ options, value, selected, onChange, label, id }: ChoiceChipsProps) {
  const estRetenue = (v: string) => (selected ? selected.includes(v) : value === v);

  return (
    <div>
      <p
        id={id}
        className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.11em] text-muted-foreground"
      >
        {label}
      </p>
      <div role="group" aria-labelledby={id} className="flex flex-wrap gap-2">
        {options.map((o) => {
          const actif = estRetenue(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={actif}
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
