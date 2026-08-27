'use client';

import { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Input } from '@/components/ui/input';
import { useDebouncedCallback } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';

/** ~300 ms : la valeur du ticket, partagée avec `AgencyCombobox` (TCK-363, AC3). */
export const CONSOLE_SEARCH_DEBOUNCE_MS = 300;

interface DebouncedSearchInputProps {
  /** La valeur COMMITÉE — celle qui part au serveur (état d'URL ou état de page). */
  readonly value: string;
  /** Appelé au plus une fois par fenêtre de temporisation, jamais par frappe. */
  readonly onCommit: (next: string) => void;
  readonly placeholder: string;
  readonly 'aria-label': string;
  /** `true` quand une requête dérivée de cette recherche est en vol. */
  readonly busy?: boolean;
  readonly className?: string;
  readonly id?: string;
}

/**
 * Le champ de recherche de la console — saisie immédiate, requête temporisée (TCK-363).
 *
 * ## Pourquoi un composant et pas trois `useDebouncedValue`
 *
 * Les écrans filtrés qui portent une recherche ne rangent pas leur état au même endroit : les uns
 * en état de page, les autres dans l'URL. Ce qu'ils partagent n'est pas l'état, c'est la RÈGLE —
 * la valeur affichée est immédiate, le commit est différé, et l'attente se voit. Recopier la
 * règle, c'est accepter qu'elle diverge : `/properties` avait déjà, seul, une soumission par
 * `<form>` qui n'envoyait rien avant la touche Entrée — donc un comportement de plus pour la
 * même barre.
 *
 * ⚠ Ils étaient trois quand TCK-363 a écrit ce fichier (`/users`, `/agencies`, `/properties`) ;
 * TCK-376 en a ajouté deux (`AuditTrail`, `PropertyModerationWorkspace`). Le compte se prend à la
 * source — `grep -rl DebouncedSearchInput src` — jamais dans cette phrase.
 *
 * ## L'indicateur n'est pas une décoration (AC4)
 *
 * `busy` seul ne suffit pas : pendant la fenêtre de temporisation, **aucune requête n'est en
 * vol**. Un indicateur branché sur le seul état de la requête laisserait l'interface muette
 * exactement pendant le délai qu'on vient d'introduire. D'où la comparaison brouillon/valeur.
 *
 * ## Le brouillon n'est PAS comparé à une valeur transformée (TCK-363, D1/D2)
 *
 * Le commit est TRIMÉ — c'est `' Dakar '` qui ne doit pas partir au serveur, pas la frappe qui
 * doit être corrigée sous les doigts. Conséquence : après un espace tapé, le brouillon vaut
 * `'Dakar '` et la valeur commitée `'Dakar'`. Comparer les deux CRÛMENT conclut à une divergence,
 * et toute resynchronisation du brouillon sur la valeur externe RÉÉCRIT alors le champ sans son
 * espace : `« Dakar » + « Immo »` se saisissait `« DakarImmo »` (mesuré). Le même écart figeait
 * l'indicateur d'attente sur une saisie faite d'espaces seuls — `role="status"` permanent pour
 * une requête qui ne partira jamais.
 *
 * La règle tient en une phrase : **on ne compare jamais le brouillon à la valeur qu'on a
 * transformée avant de l'envoyer.** Des deux côtés de la comparaison, la même normalisation.
 */
export function DebouncedSearchInput({
  value,
  onCommit,
  placeholder,
  'aria-label': ariaLabel,
  busy = false,
  className,
  id,
}: DebouncedSearchInputProps) {
  const t = useTranslations('console.search');
  const commit = useDebouncedCallback((next: string) => onCommit(next), CONSOLE_SEARCH_DEBOUNCE_MS);

  // `useStateSyncedWith(value)` — ajustement d'état pendant le rendu, sans `useEffect` — avec la
  // seule différence qui compte ici : la valeur externe ne REMPLACE le brouillon que si elle dit
  // autre chose que lui, aux espaces de bord près (cf. le bloc « le brouillon n'est PAS comparé à
  // une valeur transformée » ci-dessus). Un `?search=` remis à zéro, une navigation arrière ou un
  // clic sur « réinitialiser » vident bien le champ ; l'espace qu'on vient de taper, non.
  const [brouillon, setBrouillon] = useState(value);
  const [valeurSuivie, setValeurSuivie] = useState(value);
  if (!Object.is(value, valeurSuivie)) {
    setValeurSuivie(value);
    if (value !== brouillon.trim()) setBrouillon(value);
  }

  const enAttente = brouillon.trim() !== value || busy;

  return (
    <div className={cn('relative', className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        id={id}
        type="search"
        aria-label={ariaLabel}
        value={brouillon}
        onChange={(event) => {
          setBrouillon(event.target.value);
          commit.call(event.target.value.trim());
        }}
        // Le `blur` déclenche MAINTENANT ce qui attendait : sans lui, quitter le champ puis
        // cliquer « réinitialiser » ferait repartir la recherche après la remise à zéro.
        onBlur={() => commit.flush()}
        placeholder={placeholder}
        className="h-10 pl-9 pr-9"
      />
      {enAttente ? (
        <span
          data-testid="console-search-pending"
          role="status"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        >
          <Loader2 aria-hidden className="size-4 animate-spin" />
          <span className="sr-only">{t('pending')}</span>
        </span>
      ) : null}
    </div>
  );
}

export type { DebouncedSearchInputProps };
