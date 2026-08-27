'use client';

import { Loader2, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Input } from '@/components/ui/input';
import { useDebouncedCallback } from '@/hooks/useDebouncedValue';
import { useStateSyncedWith } from '@/hooks/useStateSyncedWith';
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
 * Les trois écrans filtrés qui portent une recherche (`/users`, `/agencies`, `/properties`) ne
 * rangent pas leur état au même endroit : deux en état de page, un dans l'URL. Ce qu'ils
 * partagent n'est pas l'état, c'est la RÈGLE — la valeur affichée est immédiate, le commit est
 * différé, et l'attente se voit. Recopier la règle trois fois, c'est accepter qu'elle diverge :
 * `/properties` avait déjà, seul des trois, une soumission par `<form>` qui n'envoyait rien
 * avant la touche Entrée — donc un troisième comportement pour la même barre.
 *
 * ## L'indicateur n'est pas une décoration (AC4)
 *
 * `busy` seul ne suffit pas : pendant la fenêtre de temporisation, **aucune requête n'est en
 * vol**. Un indicateur branché sur le seul état de la requête laisserait l'interface muette
 * exactement pendant le délai qu'on vient d'introduire. D'où `brouillon !== value || busy`.
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
  const [brouillon, setBrouillon] = useStateSyncedWith(value);
  const commit = useDebouncedCallback((next: string) => onCommit(next), CONSOLE_SEARCH_DEBOUNCE_MS);

  const enAttente = brouillon !== value || busy;

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
