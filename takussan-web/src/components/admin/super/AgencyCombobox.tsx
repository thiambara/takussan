'use client';

import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Combobox } from '@base-ui/react/combobox';
import { Check, ChevronDown, Loader2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { fetchAdminAgencies, fetchAdminAgencyDetail } from '@/lib/queries/super-admin';
import type { AdminAgenciesResponse, AdminAgencyDetailResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Le délai d'anti-rebond des trois champs de recherche de la console (TCK-363, AC3). */
export const AGENCY_SEARCH_DEBOUNCE_MS = 300;

/** Une page de résultats. 20, comme les listes de la console — pas 50 « au cas où ». */
const PER_PAGE = 20;

type AgencyItem = { value: string; label: string };

interface AgencyComboboxProps {
  /** L'identifiant d'agence sélectionné, en chaîne. `''` = aucune agence. */
  readonly value: string;
  readonly onChange: (next: string) => void;
  /** Le libellé accessible du champ. Rendu en `aria-label` sur la saisie. */
  readonly label: string;
  readonly className?: string;
  /** Placeholder du champ. Vaut le libellé « toutes agences » quand rien n'est choisi. */
  readonly placeholder?: string;
}

/**
 * Le sélecteur d'agence de la console super-admin — un seul, partagé par `/users`,
 * `/properties` et `/moderation` (TCK-363).
 *
 * ## Ce qu'il remplace, et pourquoi les deux formes précédentes étaient fausses
 *
 * `/users` demandait un `<input type="number">` : l'identifiant NUMÉRIQUE d'une agence, de
 * mémoire. `/properties` et `/moderation` chargeaient `fetchAdminAgencies({ perPage: 50 })` et
 * peuplaient un `<Select>` : au-delà de la 50ᵉ agence, celle qu'on cherche est simplement
 * **absente de la liste, sans que rien ne le dise**. Les deux défauts se ressemblent peu et
 * coûtent la même chose — une agence qu'on ne peut pas désigner.
 *
 * ## Trois propriétés, et aucune n'est décorative
 *
 * 1. **La recherche est SERVEUR** (`filter[search]` sur `/api/admin/agencies`, qui couvre
 *    `name`, `slug` et `email`). `filter={null}` coupe le filtrage interne de Base UI : filtrer
 *    côté client une liste déjà tronquée redirait exactement le défaut qu'on corrige.
 * 2. **Le chargement est À LA DEMANDE** — `enabled: open` : rien ne part tant que le sélecteur
 *    n'est pas ouvert. Les deux écrans qui chargeaient 50 agences le faisaient au montage de la
 *    page, filtre utilisé ou non.
 * 3. **La troncature est DITE, et franchissable.** Le pied de liste affiche « n sur N » et un
 *    bouton qui charge la page suivante. Un sélecteur qui tait ce qu'il ne montre pas est pire
 *    qu'un sélecteur absent : on le croit exhaustif.
 *
 * ## Le nom de l'agence sélectionnée survit au rechargement
 *
 * L'état des filtres vit dans l'URL : au montage, on n'a qu'un identifiant. `detailQuery` va
 * chercher le nom — et seulement dans ce cas (`enabled` ci-dessous), jamais après une sélection
 * faite à l'écran, dont le libellé est déjà connu.
 */
export function AgencyCombobox({
  value,
  onChange,
  label,
  className,
  placeholder,
}: AgencyComboboxProps) {
  const t = useTranslations('console.agencyCombobox');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, AGENCY_SEARCH_DEBOUNCE_MS);

  // Le libellé de la valeur COURANTE, mémorisé au moment du choix. Il est indexé par
  // l'identifiant : si `value` change sous nos pieds (URL, réinitialisation), il redevient
  // inconnu au lieu de mentir.
  const [labelled, setLabelled] = useState<AgencyItem | null>(null);
  const knownLabel = labelled && labelled.value === value ? labelled.label : null;

  const listQuery = useInfiniteQuery<AdminAgenciesResponse, ApiError>({
    queryKey: ['super-admin', 'agencies', 'combobox', debouncedQuery],
    queryFn: ({ pageParam }) =>
      fetchAdminAgencies({
        search: debouncedQuery.trim() || undefined,
        sort: 'name',
        page: pageParam as number,
        perPage: PER_PAGE,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined,
    enabled: open,
    staleTime: 60_000,
  });

  const detailQuery = useQuery<AdminAgencyDetailResponse, ApiError>({
    queryKey: ['super-admin', 'agency-label', value],
    queryFn: () => fetchAdminAgencyDetail(Number(value)),
    enabled: value !== '' && knownLabel === null,
    staleTime: 5 * 60_000,
  });

  const items: AgencyItem[] = (listQuery.data?.pages ?? []).flatMap((page) =>
    page.data.map((agency) => ({ value: String(agency.id), label: agency.name })),
  );

  const total = listQuery.data?.pages[0]?.meta.total ?? 0;
  const selectedLabel = knownLabel ?? detailQuery.data?.data.name ?? null;
  const selected: AgencyItem | null = value === '' ? null : { value, label: selectedLabel ?? value };

  // ⚠ `query !== debouncedQuery` — et PAS seulement `isFetching`. Pendant les 300 ms d'attente,
  // aucune requête n'est en vol : une pastille branchée sur le seul `isFetching` laisserait
  // l'interface muette exactement pendant le délai qu'on vient d'introduire (AC4).
  const enAttente = query !== debouncedQuery || listQuery.isFetching;

  return (
    <Combobox.Root<AgencyItem>
      items={items}
      filter={null}
      value={selected}
      isItemEqualToValue={(item, current) => item.value === current.value}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // À la fermeture, la saisie repart de zéro : sans ça, rouvrir le sélecteur rendrait la
        // recherche d'AVANT tout en affichant le nom de l'agence choisie — deux états qui se
        // contredisent dans le même champ.
        if (!next) setQuery('');
      }}
      inputValue={open ? query : (selectedLabel ?? '')}
      onInputValueChange={(next, { reason }) => {
        if (reason === 'item-press') return;
        setQuery(next);
      }}
      onValueChange={(next) => {
        setLabelled(next);
        onChange(next?.value ?? '');
        setQuery('');
      }}
    >
      <Combobox.InputGroup className={cn('relative flex h-10 items-center', className)}>
        <Combobox.Input
          aria-label={label}
          placeholder={placeholder ?? t('placeholder')}
          className="h-10 w-full rounded-lg border border-input bg-transparent py-2 pr-16 pl-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <div className="absolute right-1 flex h-full items-center text-muted-foreground">
          {enAttente ? (
            <Loader2
              aria-hidden
              data-testid="agency-combobox-pending"
              className="mr-1 size-4 animate-spin"
            />
          ) : null}
          <Combobox.Clear
            aria-label={t('clearAria')}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          >
            <X aria-hidden className="size-4" />
          </Combobox.Clear>
          <Combobox.Trigger
            aria-label={t('openAria')}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          >
            <ChevronDown aria-hidden className="size-4" />
          </Combobox.Trigger>
        </div>
      </Combobox.InputGroup>

      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="isolate z-[1100] outline-none">
          <Combobox.Popup className="max-h-[min(var(--available-height),20rem)] w-(--anchor-width) min-w-56 overflow-y-auto rounded-lg bg-popover py-1 text-popover-foreground shadow-md ring-1 ring-border">
            <Combobox.Status>
              {enAttente ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">{t('searching')}</p>
              ) : null}
            </Combobox.Status>
            <Combobox.Empty>
              {!enAttente && !listQuery.isError ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">{t('noResult')}</p>
              ) : null}
            </Combobox.Empty>
            <Combobox.List>
              {(item: AgencyItem) => (
                <Combobox.Item
                  key={item.value}
                  value={item}
                  className="relative flex w-full cursor-default items-center gap-2 py-1.5 pr-3 pl-8 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <Combobox.ItemIndicator className="absolute left-2 flex size-4 items-center justify-center">
                    <Check aria-hidden className="size-4" />
                  </Combobox.ItemIndicator>
                  {item.label}
                </Combobox.Item>
              )}
            </Combobox.List>

            {items.length > 0 ? (
              <div className="mt-1 flex items-center justify-between gap-2 border-t border-border px-3 pt-2 pb-1">
                <span className="text-xs text-muted-foreground">
                  {t('shown', { shown: items.length, total })}
                </span>
                {listQuery.hasNextPage ? (
                  <button
                    type="button"
                    // Le `mousedown` par défaut retire le focus de la saisie, ce qui referme le
                    // popup AVANT que le `click` n'arrive : le bouton serait inerte à la souris.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void listQuery.fetchNextPage()}
                    disabled={listQuery.isFetchingNextPage}
                    className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-accent disabled:opacity-50"
                  >
                    {t('loadMore')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

export type { AgencyComboboxProps };
