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
 * `<form>` qui n'envoyait rien avant la touche Entrée.
 *
 * ## Le brouillon N'EST PAS resynchronisé sur notre propre commit (TCK-376)
 *
 * La première version tenait le brouillon par `useStateSyncedWith(value)` tout en commitant
 * `value.trim()`. Les deux ensemble **mangent les espaces** : taper `Dakar␣` commite `Dakar`,
 * la resynchronisation réécrit le brouillon à `Dakar`, l'espace disparaît sous le curseur, et la
 * frappe suivante donne `DakarImmo`. Ce n'est pas un cas limite : tout nom en deux mots le
 * traverse.
 *
 * La correction n'est pas de cesser de `trim()` — envoyer `Dakar␣` au serveur ne trouve rien —
 * mais de distinguer les deux raisons qu'a `value` de changer :
 *
 * - **c'est notre commit qui revient** (`brouillon.trim() === value`) → le brouillon ne bouge pas,
 *   il est la source de ce qu'on voit ;
 * - **c'est quelqu'un d'autre** (retour arrière du navigateur, « réinitialiser », lien collé) →
 *   le brouillon adopte.
 *
 * ## L'indicateur n'est pas une décoration, et il compare des valeurs REPLIÉES
 *
 * `busy` seul ne suffit pas : pendant la fenêtre de temporisation, **aucune requête n'est en
 * vol**. Un indicateur branché sur le seul état de la requête laisserait l'interface muette
 * exactement pendant le délai qu'on vient d'introduire.
 *
 * Mais `brouillon !== value` ne convient pas non plus : sur `Dakar␣` — et pire, sur une saisie
 * d'espaces seuls — la comparaison reste vraie pour toujours, et la pastille tourne sans fin
 * derrière une recherche qui est arrivée. On compare donc ce qui PART (`brouillon.trim()`) à ce
 * qui est parti (`value`).
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

  const [brouillon, setBrouillon] = useState(value);
  // `ancre` mémorise la dernière `value` VUE, pour ne réagir qu'à ses changements. C'est
  // l'ajustement d'état pendant le rendu de `useStateSyncedWith` (TCK-316), avec sa condition
  // d'adoption resserrée — on ne pouvait pas le réutiliser tel quel, il adopte toujours.
  const [ancre, setAncre] = useState(value);
  if (!Object.is(value, ancre)) {
    setAncre(value);
    if (brouillon.trim() !== value) setBrouillon(value);
  }

  const commit = useDebouncedCallback((next: string) => onCommit(next), CONSOLE_SEARCH_DEBOUNCE_MS);

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
