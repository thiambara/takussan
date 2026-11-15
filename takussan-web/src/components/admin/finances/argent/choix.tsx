'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';

/**
 * TCK-2659 — les sélecteurs fermés de « Argent » : la pastille de la maquette (`Selecteur`,
 * `app-argent-pieces.tsx` — `h-9`, filet, `px-3`, texte 14 px 500, chevron discret), ouverte en
 * liste. Deux formes :
 *
 * - `ChoixDansUneListe` — une liste courte connue (mois, moyen, statut) ;
 * - `ChoixAvecRecherche` — une liste servie par l'API (payeur, bien, bailleur) : la recherche part au
 *   SERVEUR, après une pause de frappe, et rien ne part tant que la pastille est fermée.
 *
 * Une pastille porteuse d'un choix le dit : son libellé devient la valeur choisie, et la pastille
 * prend l'encre pleine (`aria-pressed` n'a pas cours sur un déclencheur de menu).
 */

export interface OptionDeChoix {
  readonly value: string;
  readonly label: string;
  /** `true` quand `label` n'est qu'un repli (« #42 ») : la liste le montre, la pastille ne le reprend jamais. */
  readonly sansNom?: boolean;
}

const CLASSE_PASTILLE =
  'inline-flex h-9 max-w-full flex-none items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring data-[choisi=true]:border-foreground';

interface ProprietesDeLaPastille {
  /** Le nom du filtre (« Moyen ») : le libellé de la pastille sans choix, et son nom accessible. */
  readonly libelle: string;
  /** Le libellé de la valeur choisie, `null` sans choix. */
  readonly choisi: string | null;
  readonly icone?: ReactNode;
  readonly className?: string;
}

function ContenuDeLaPastille({ libelle, choisi, icone }: ProprietesDeLaPastille) {
  return (
    <>
      {icone}
      <span className="min-w-0 truncate">{choisi ?? libelle}</span>
      <ChevronDown className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
    </>
  );
}

export function ChoixDansUneListe({
  libelle,
  choisi,
  icone,
  className,
  options,
  value,
  onChange,
  tous,
}: ProprietesDeLaPastille & {
  readonly options: readonly OptionDeChoix[];
  readonly value: string | null;
  readonly onChange: (value: string | null) => void;
  /** Le libellé de l'option « sans filtre » (« Tous les moyens »), absente quand le choix est obligatoire. */
  readonly tous?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={choisi ? `${libelle} : ${choisi}` : libelle}
        data-choisi={choisi !== null && tous !== undefined}
        className={cn(CLASSE_PASTILLE, className)}
      >
        <ContenuDeLaPastille libelle={libelle} choisi={choisi} icone={icone} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        {tous !== undefined ? (
          <DropdownMenuItem onClick={() => onChange(null)}>
            <Coche active={value === null} />
            {tous}
          </DropdownMenuItem>
        ) : null}
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onClick={() => onChange(o.value)}>
            <Coche active={value === o.value} />
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Coche({ active }: { readonly active: boolean }) {
  return <Check className={cn('size-4 flex-none', active ? 'text-foreground' : 'invisible')} aria-hidden="true" />;
}

/** Le délai de frappe des recherches de la console (`CONSOLE_SEARCH_DEBOUNCE_MS`). */
const PAUSE_DE_FRAPPE_MS = 300;

/** L'état d'une recherche de pastille : la frappe, la requête après la pause, l'ouverture. */
export interface EtatDeRecherche {
  readonly frappe: string;
  readonly setFrappe: (frappe: string) => void;
  /** La frappe après {@link PAUSE_DE_FRAPPE_MS}, rognée : c'est elle qui part au serveur. */
  readonly requete: string;
  readonly ouvert: boolean;
  readonly setOuvert: (ouvert: boolean) => void;
}

export function useEtatDeRecherche(): EtatDeRecherche {
  const [ouvert, setOuvert] = useState(false);
  const [frappe, setFrappe] = useState('');
  const requete = useDebouncedValue(frappe, PAUSE_DE_FRAPPE_MS).trim();
  return { frappe, setFrappe, requete, ouvert, setOuvert };
}

export function ChoixAvecRecherche({
  libelle,
  choisi,
  icone,
  className,
  value,
  onChange,
  etat,
  options,
  chargement,
  placeholder,
}: ProprietesDeLaPastille & {
  readonly value: string | null;
  readonly onChange: (option: OptionDeChoix | null) => void;
  /** De {@link useEtatDeRecherche} : l'appelant y lit `requete` et `ouvert` pour SA requête. */
  readonly etat: EtatDeRecherche;
  readonly options: readonly OptionDeChoix[];
  readonly chargement: boolean;
  readonly placeholder: string;
}) {
  const t = useTranslations('admin.finances.argent.choix');
  const { frappe, setFrappe, requete, ouvert, setOuvert } = etat;
  // TCK-2659 (vérification adverse) — le nom d'un choix vient de la page reçue (`choisi`) ; à défaut, du
  // choix fait ici même (la liste nommait l'option), jamais d'un identifiant (« #42 »). Sans nom connu,
  // la pastille garde son libellé et l'encre du choix : le filtre posé reste visible et s'efface.
  const [dernier, setDernier] = useState<OptionDeChoix | null>(null);
  const nomDuChoix = choisi ?? (dernier !== null && dernier.value === value ? dernier.label : null);
  const enAttente = chargement || frappe.trim() !== requete;
  // À l'ouverture, le focus va au champ de recherche (`initialFocus` du popup, pas `autoFocus`).
  const champ = useRef<HTMLInputElement>(null);

  return (
    <Popover
      open={ouvert}
      onOpenChange={(suivant) => {
        setOuvert(suivant);
        if (!suivant) setFrappe('');
      }}
    >
      <PopoverTrigger
        aria-label={nomDuChoix ? `${libelle} : ${nomDuChoix}` : libelle}
        data-choisi={value !== null}
        className={cn(CLASSE_PASTILLE, className)}
      >
        <ContenuDeLaPastille libelle={libelle} choisi={nomDuChoix} icone={icone} />
      </PopoverTrigger>
      <PopoverContent className="w-72 p-1" initialFocus={champ}>
        <div className="relative border-b border-border p-1.5 pb-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            ref={champ}
            type="search"
            value={frappe}
            onChange={(e) => setFrappe(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="pl-8 pr-8"
          />
          {enAttente ? (
            <Loader2 className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />
          ) : null}
        </div>
        <ul className="max-h-72 overflow-y-auto py-1" aria-label={libelle}>
          {value !== null ? (
            <li>
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOuvert(false);
                }}
                className="flex min-h-10 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm text-muted-foreground outline-none hover:bg-muted focus-visible:bg-muted"
              >
                <X className="size-4 flex-none" aria-hidden="true" />
                {t('effacer')}
              </button>
            </li>
          ) : null}
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                onClick={() => {
                  setDernier(o.sansNom ? null : o);
                  onChange(o);
                  setOuvert(false);
                }}
                className="flex min-h-10 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
              >
                <Coche active={value === o.value} />
                <span className="min-w-0 truncate">{o.label}</span>
              </button>
            </li>
          ))}
          {!enAttente && options.length === 0 ? (
            <li className="px-2.5 py-2 text-sm text-muted-foreground">{t('aucun')}</li>
          ) : null}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
