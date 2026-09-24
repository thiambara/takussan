'use client';

import { useState } from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Check, ChevronDown, Loader2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useGroupLeaseOptions, useGroupPropertyOptions } from '@/lib/queries/conversations';
import { PARTICIPANT_SEARCH_DEBOUNCE_MS } from './ParticipantPicker';

/**
 * Un bien ou un bail tel que le sélecteur le montre : un libellé (ce qu'on lit dans le champ une
 * fois choisi) et un détail qui distingue deux homonymes — onze titres de la démo sont portés par
 * plusieurs biens.
 */
export type GroupContextOption = {
  readonly id: number;
  readonly label: string;
  readonly detail: string | null;
  /**
   * Pour un BAIL : le bien qu'il concerne. `NewGroupDialog` le lit pour ne retirer le bail que si
   * l'on choisit un AUTRE bien — choisir le sien le garde (réparation 1, 2026-09-24).
   */
  readonly propertyId?: number | null;
};

interface CommonProps {
  /** `id` de la saisie, pour le `<label htmlFor>` de l'appelant. */
  readonly inputId: string;
  readonly value: GroupContextOption | null;
  readonly onChange: (next: GroupContextOption | null) => void;
}

/**
 * TCK-576 — le BIEN d'un groupe, cherché par son titre ou sa référence, côté serveur.
 *
 * Remplace la liste de TCK-565, plafonnée aux 100 premiers biens et sans recherche : un agent de
 * démo en voyait 206, et 106 ne pouvaient pas être rattachés à un groupe.
 */
export function GroupPropertyPicker({ inputId, value, onChange }: CommonProps) {
  const t = useTranslations('messaging.group.create');
  const recherche = useRecherche();
  const biens = useGroupPropertyOptions(recherche.debounced, { enabled: recherche.open });

  return (
    <ContextCombobox
      inputId={inputId}
      value={value}
      onChange={onChange}
      recherche={recherche}
      options={(biens.data?.data ?? []).map((p) => ({
        id: p.id,
        label: p.title,
        detail: p.reference_number,
      }))}
      total={biens.data?.meta.total ?? 0}
      isFetching={biens.isFetching}
      isError={biens.isError}
      onRetry={() => void biens.refetch()}
      placeholder={t('propertyPlaceholder')}
      clearLabel={t('clearProperty')}
      emptyLabel={t('noPropertyMatch')}
      emptyYetLabel={t('noPropertyYet')}
    />
  );
}

/**
 * TCK-576 — le BAIL d'un groupe, cherché par sa référence ou par le titre de son bien, et
 * restreint au bien choisi s'il y en a un (`filter[property_id]`).
 */
export function GroupLeasePicker({
  inputId,
  value,
  onChange,
  propertyId,
}: CommonProps & { readonly propertyId: number | null }) {
  const t = useTranslations('messaging.group.create');
  const recherche = useRecherche();
  const baux = useGroupLeaseOptions(propertyId, recherche.debounced, { enabled: recherche.open });

  return (
    <ContextCombobox
      inputId={inputId}
      value={value}
      onChange={onChange}
      recherche={recherche}
      options={(baux.data?.data ?? []).map((l) => ({
        id: l.id,
        label: l.reference_number,
        detail: l.property?.title ?? null,
        propertyId: l.property_id,
      }))}
      total={baux.data?.meta.total ?? 0}
      isFetching={baux.isFetching}
      isError={baux.isError}
      onRetry={() => void baux.refetch()}
      placeholder={t('leasePlaceholder')}
      clearLabel={t('clearLease')}
      emptyLabel={t('noLeaseMatch')}
      emptyYetLabel={propertyId ? t('noLeaseForProperty') : t('noLeaseYet')}
    />
  );
}

type Recherche = ReturnType<typeof useRecherche>;

/** L'état d'ouverture et la saisie, temporisée comme celle des participants (300 ms). */
function useRecherche() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, PARTICIPANT_SEARCH_DEBOUNCE_MS);
  return { open, setOpen, query, setQuery, debounced };
}

interface ContextComboboxProps extends CommonProps {
  readonly recherche: Recherche;
  readonly options: GroupContextOption[];
  readonly total: number;
  readonly isFetching: boolean;
  readonly isError: boolean;
  readonly onRetry: () => void;
  readonly placeholder: string;
  readonly clearLabel: string;
  /** Aucun résultat pour une RECHERCHE : inviter à la reformuler. */
  readonly emptyLabel: string;
  /**
   * Aucun résultat SANS recherche : il n'y a rien à chercher (acteur sans bien, bien sans bail).
   * Même distinction que `noContactYet` des participants — « aucun résultat » à qui n'a rien
   * cherché le renvoie reformuler une saisie qu'il n'a pas faite.
   */
  readonly emptyYetLabel: string;
}

/**
 * Le combobox commun aux deux champs. Mêmes trois propriétés que `ParticipantPicker` et
 * `AgencyCombobox` (TCK-363) : recherche SERVEUR (`filter={null}` coupe le filtrage de Base UI,
 * qui cacherait ce que la page tronquée ne contient pas), chargement À L'OUVERTURE, troncature
 * DITE (« 20 sur 206 — précisez la recherche »).
 *
 * « Aucun bien » n'est plus une option de la liste : le champ vide EST l'absence de rattachement,
 * et la croix « Retirer le bien » (44 px) y ramène.
 */
function ContextCombobox({
  inputId,
  value,
  onChange,
  recherche,
  options,
  total,
  isFetching,
  isError,
  onRetry,
  placeholder,
  clearLabel,
  emptyLabel,
  emptyYetLabel,
}: ContextComboboxProps) {
  const t = useTranslations('messaging.group.create');
  const { open, setOpen, query, setQuery, debounced } = recherche;

  // ⚠ `query !== debounced` et pas seulement `isFetching` : pendant la temporisation, aucune
  // requête n'est en vol, et l'interface resterait muette exactement pendant le délai ajouté.
  const enAttente = query !== debounced || isFetching;

  return (
    <Combobox.Root<GroupContextOption>
      items={options}
      filter={null}
      value={value}
      itemToStringLabel={(option) => option.label}
      isItemEqualToValue={(item, current) => item.id === current.id}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Rouvrir le champ repart d'une recherche vide, au lieu de mêler l'ancienne saisie au
        // libellé du bien choisi.
        if (!next) setQuery('');
      }}
      inputValue={open ? query : (value?.label ?? '')}
      onInputValueChange={(next, { reason }) => {
        if (reason === 'item-press') return;
        setQuery(next);
      }}
      onValueChange={(next) => {
        onChange(next);
        setQuery('');
      }}
    >
      <Combobox.InputGroup className="relative flex items-center">
        <Combobox.Input
          id={inputId}
          placeholder={placeholder}
          autoComplete="off"
          // 44 px, comme le champ des participants : il se tape au pouce. `pr-16` réserve la croix
          // (44 px) et la pastille d'attente ; `text-ellipsis` dit qu'un long titre choisi est coupé.
          className="h-11 w-full rounded-lg border border-input bg-transparent py-2 pr-16 pl-3 text-base text-ellipsis outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
        />
        <div className="absolute right-0 flex h-full items-center text-muted-foreground">
          {enAttente && open ? (
            <Loader2
              aria-hidden
              data-testid="group-context-pending"
              className="mr-1 size-4 animate-spin"
            />
          ) : null}
          {value ? (
            <Combobox.Clear
              aria-label={clearLabel}
              className="flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <X aria-hidden className="size-4" />
            </Combobox.Clear>
          ) : (
            <ChevronDown aria-hidden className="pointer-events-none mr-3 size-4" />
          )}
        </div>
      </Combobox.InputGroup>

      <Combobox.Portal>
        {/* Au-dessus du dialogue (z-50) qui le contient. */}
        <Combobox.Positioner sideOffset={4} className="isolate z-[1100] outline-none">
          <Combobox.Popup className="max-h-[min(var(--available-height),18rem)] w-(--anchor-width) overflow-y-auto rounded-lg bg-popover py-1 text-popover-foreground shadow-md ring-1 ring-border">
            <Combobox.Status>
              {enAttente && options.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">{t('searching')}</p>
              ) : null}
            </Combobox.Status>
            <Combobox.Empty>
              {!enAttente && !isError ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  {debounced.trim() === '' ? emptyYetLabel : emptyLabel}
                </p>
              ) : null}
            </Combobox.Empty>
            <Combobox.List>
              {(option: GroupContextOption) => (
                <Combobox.Item
                  key={option.id}
                  value={option}
                  className="relative flex min-h-11 w-full cursor-default flex-col justify-center py-1.5 pr-3 pl-8 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <Combobox.ItemIndicator className="absolute left-2 flex size-4 items-center justify-center">
                    <Check aria-hidden className="size-4" />
                  </Combobox.ItemIndicator>
                  <span className="min-w-0 truncate">{option.label}</span>
                  {option.detail ? (
                    <span className="min-w-0 truncate text-xs text-muted-foreground">
                      {option.detail}
                    </span>
                  ) : null}
                </Combobox.Item>
              )}
            </Combobox.List>

            {isError ? (
              <div
                role="alert"
                data-testid="group-context-error"
                className="flex items-center justify-between gap-2 px-3 py-2"
              >
                <p className="text-sm text-destructive">{t('contextError')}</p>
                <button
                  type="button"
                  // Le `mousedown` par défaut retire le focus de la saisie et referme le popup
                  // AVANT que le `click` n'arrive (même raison que dans `AgencyCombobox`).
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={onRetry}
                  className="min-h-11 shrink-0 rounded-md px-3 text-sm font-medium text-primary hover:bg-accent"
                >
                  {t('retry')}
                </button>
              </div>
            ) : null}

            {!isError && total > options.length ? (
              <p className="border-t border-border px-3 pt-2 pb-1 text-xs text-muted-foreground">
                {t('moreResults', { shown: options.length, total })}
              </p>
            ) : null}
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
