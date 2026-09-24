'use client';

import { useState } from 'react';
import { Combobox } from '@base-ui/react/combobox';
import { Loader2, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useMessagingContacts, type MessagingContact } from '@/lib/queries/conversations';
import { cn } from '@/lib/utils';

/** Même délai que les sélecteurs à recherche serveur de la console (TCK-363). */
export const PARTICIPANT_SEARCH_DEBOUNCE_MS = 300;

interface ParticipantPickerProps {
  /** Les personnes déjà choisies, dans l'ordre du choix. */
  readonly value: readonly MessagingContact[];
  readonly onChange: (next: MessagingContact[]) => void;
  /** Nombre maximal de personnes choisies (le créateur du groupe non compris). */
  readonly max: number;
  /** Appelé quand on tente d'ajouter au-delà de `max` — l'appelant affiche son message. */
  readonly onMaxReached?: () => void;
  /** `id` de la saisie, pour le `<label htmlFor>` de l'appelant. */
  readonly inputId: string;
  /** `id` de l'aide affichée sous le champ par l'appelant. */
  readonly describedBy?: string;
  /** Personnes à ne pas proposer (déjà membres du groupe qu'on complète). */
  readonly excludeIds?: readonly number[];
  /**
   * Le groupe EXISTANT qu'on complète : la liste vient alors de la règle d'ajout à CE groupe
   * (`/api/conversations/{id}/contacts`), et non de celle d'un nouveau groupe.
   */
  readonly conversationId?: number;
}

/** Deux initiales, pour la pastille d'une personne sans avatar. */
function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot[0])
    .join('')
    .toUpperCase();
}

function Pastille({ contact }: { contact: MessagingContact }) {
  return (
    <span
      aria-hidden
      className="relative flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[11px] font-semibold text-muted-foreground"
    >
      {contact.avatar_url ? (
        // Avatar distant et de taille fixe : `next/image` n'apporterait rien ici et exigerait
        // de déclarer l'hôte du stockage.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={contact.avatar_url} alt="" className="size-full object-cover" />
      ) : (
        initiales(contact.name)
      )}
    </span>
  );
}

/**
 * TCK-565 — choisir les participants d'un groupe PAR LEUR NOM.
 *
 * Retour testeur du 2026-09-23 (M12) : « Où un utilisateur verrait-il son ID ? ». Le champ
 * précédent était un `<input type="number">` « ID utilisateur », avec l'aide « Saisissez les IDs
 * un par un. Le serveur vérifie les permissions. » — un identifiant qu'aucun écran ne montre, et
 * une vérification que le serveur ne faisait pas (cf. `CreateGroupConversationRequest`).
 *
 * Trois propriétés, reprises de `AgencyCombobox` (TCK-363) qui a soldé le même défaut ailleurs :
 *
 * 1. **La recherche est SERVEUR** (`filter[search]` sur `/api/conversations/contacts`) et
 *    `filter={null}` coupe le filtrage interne de Base UI : filtrer côté client une liste déjà
 *    tronquée cacherait sans le dire la personne qu'on cherche.
 * 2. **Le chargement est À LA DEMANDE** : rien ne part tant que le champ n'est pas ouvert.
 * 3. **La troncature est DITE** : « 20 sur 34 — précisez la recherche ».
 *
 * La liste ne propose QUE des personnes que le serveur acceptera (même règle, `MessagingReach`,
 * lue AVEC le groupe quand on en complète un — `conversationId`), et jamais une personne déjà
 * choisie : le doublon n'est plus une erreur à afficher, il est impossible à produire.
 */
export function ParticipantPicker({
  value,
  onChange,
  max,
  onMaxReached,
  inputId,
  describedBy,
  excludeIds = [],
  conversationId,
}: ParticipantPickerProps) {
  const t = useTranslations('messaging.group.create');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, PARTICIPANT_SEARCH_DEBOUNCE_MS);

  const contacts = useMessagingContacts(debouncedQuery, { enabled: open, conversationId });

  const choisis = new Set([...value.map((c) => c.id), ...excludeIds]);
  const items = (contacts.data?.data ?? []).filter((c) => !choisis.has(c.id));
  const total = contacts.data?.meta.total ?? 0;
  const charges = contacts.data?.data.length ?? 0;

  // ⚠ `query !== debouncedQuery` et pas seulement `isFetching` : pendant la temporisation, aucune
  // requête n'est en vol, et l'interface resterait muette exactement pendant le délai ajouté.
  const enAttente = query !== debouncedQuery || contacts.isFetching;
  const rienAInviter = !enAttente && !contacts.isError && debouncedQuery.trim() === '' && total === 0;

  function ajouter(contact: MessagingContact | null) {
    if (!contact || choisis.has(contact.id)) return;
    if (value.length >= max) {
      onMaxReached?.();
      return;
    }
    onChange([...value, contact]);
    setQuery('');
  }

  function retirer(id: number) {
    onChange(value.filter((c) => c.id !== id));
  }

  return (
    <div className="space-y-2">
      <Combobox.Root<MessagingContact>
        items={items}
        filter={null}
        value={null}
        itemToStringLabel={(contact) => contact.name}
        isItemEqualToValue={(item, current) => item.id === current.id}
        open={open}
        onOpenChange={setOpen}
        inputValue={query}
        onInputValueChange={(next, { reason }) => {
          if (reason === 'item-press') return;
          setQuery(next);
        }}
        onValueChange={ajouter}
      >
        <Combobox.InputGroup className="relative flex items-center">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
          />
          <Combobox.Input
            id={inputId}
            aria-describedby={describedBy}
            placeholder={t('participantInputPlaceholder')}
            autoComplete="off"
            // 44 px : c'est le champ principal de l'étape, et il se tape au pouce.
            className="h-11 w-full rounded-lg border border-input bg-transparent py-2 pr-10 pl-9 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
          />
          {enAttente && open ? (
            <Loader2
              aria-hidden
              data-testid="participant-picker-pending"
              className="absolute right-3 size-4 animate-spin text-muted-foreground"
            />
          ) : null}
        </Combobox.InputGroup>

        <Combobox.Portal>
          {/* Au-dessus du dialogue (z-50) qui le contient. */}
          <Combobox.Positioner sideOffset={4} className="isolate z-[1100] outline-none">
            <Combobox.Popup className="max-h-[min(var(--available-height),18rem)] w-(--anchor-width) overflow-y-auto rounded-lg bg-popover py-1 text-popover-foreground shadow-md ring-1 ring-border">
              <Combobox.Status>
                {enAttente && items.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">{t('searching')}</p>
                ) : null}
              </Combobox.Status>
              <Combobox.Empty>
                {!enAttente && !contacts.isError ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    {rienAInviter ? t('noContactYet') : t('noContact')}
                  </p>
                ) : null}
              </Combobox.Empty>
              <Combobox.List>
                {(contact: MessagingContact) => (
                  <Combobox.Item
                    key={contact.id}
                    value={contact}
                    className="flex min-h-11 w-full cursor-default items-center gap-3 px-3 py-1.5 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    <Pastille contact={contact} />
                    <span className="min-w-0 truncate">{contact.name}</span>
                  </Combobox.Item>
                )}
              </Combobox.List>

              {contacts.isError ? (
                <div
                  role="alert"
                  data-testid="participant-picker-error"
                  className="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <p className="text-sm text-destructive">{t('contactsError')}</p>
                  <button
                    type="button"
                    // Le `mousedown` par défaut retire le focus de la saisie et referme le popup
                    // AVANT que le `click` n'arrive (même raison que dans `AgencyCombobox`).
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => void contacts.refetch()}
                    className="min-h-11 shrink-0 rounded-md px-3 text-sm font-medium text-primary hover:bg-accent"
                  >
                    {t('retry')}
                  </button>
                </div>
              ) : null}

              {!contacts.isError && total > charges ? (
                <p className="border-t border-border px-3 pt-2 pb-1 text-xs text-muted-foreground">
                  {t('moreResults', { shown: charges, total })}
                </p>
              ) : null}
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>

      {value.length > 0 ? (
        <ul
          aria-label={t('selectedLabel')}
          data-testid="participant-chips"
          className="flex flex-wrap gap-2"
        >
          {value.map((contact) => (
            <li
              key={contact.id}
              className="flex h-9 max-w-full items-center gap-1.5 rounded-full bg-secondary py-1 pr-1 pl-1 text-sm text-secondary-foreground"
            >
              <Pastille contact={contact} />
              <span className="min-w-0 truncate">{contact.name}</span>
              <button
                type="button"
                aria-label={t('removeParticipant', { name: contact.name })}
                onClick={() => retirer(contact.id)}
                className={cn(
                  // Pastille de 28 px, zone tactile de 44 : le pseudo-élément l'étend de 8 px de
                  // chaque côté sans déformer la puce.
                  'relative flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors after:absolute after:-inset-2 hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
