'use client';

import { useState, type Ref } from 'react';
import { Combobox as Base } from '@base-ui/react/combobox';
import { Check, ChevronDown, Loader2, Plus, X } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * TCK-633 — la liste à recherche du formulaire du bien (région, ville, quartier, équipements).
 *
 * Trois règles, et chacune a son test :
 *  1. on TROUVE sans les accents, les tirets ni les apostrophes (`replierPourRecherche`) : « medina »
 *     trouve « Médina », et « Grand-Yoff » trouve « Grand Yoff » (TCK-788 : le résolveur du serveur
 *     replie les mêmes séparateurs, `GeoNeighborhoodResolver::SEPARATEURS`) ;
 *  2. un nom EXISTE à la casse près seulement (`replierPourIdentite`) — la règle de l'index du
 *     serveur, qui ne replie pas les accents (ADR-0025) ; « Liberte 4 » n'est donc pas un doublon
 *     de « Liberté 4 », mais l'existant est listé AVANT la ligne « Ajouter », et Entrée le choisit ;
 *  3. seule la FRAPPE écrit le texte : Base UI remet le champ à zéro en interne (fermeture,
 *     sélection), et un quartier tapé hors liste disparaissait en quittant le champ.
 *
 * ⚠ Aucun `useMemo` / `useCallback` : le React Compiler s'en charge (ADR-0015).
 */
export interface OptionDeListe {
  readonly value: string;
  readonly label: string;
  /** Une précision affichée APRÈS le libellé (« en attente de vérification »). */
  readonly indice?: string;
}

/** La valeur réservée à la ligne « Ajouter « … » » — jamais une valeur métier. */
export const VALEUR_CREER = '__creer__';

const DIACRITIQUES = /[\u0300-\u036f]/g;
/** Blancs, tirets (ASCII et typographiques) et apostrophes : les séparateurs du résolveur serveur. */
const SEPARATEURS = /[\s'’ʼ‐‑‒–—-]+/g;

export function replierPourRecherche(texte: string): string {
  return texte.normalize('NFD').replace(DIACRITIQUES, '').toLocaleLowerCase('fr').replace(SEPARATEURS, ' ').trim();
}

export function replierPourIdentite(texte: string): string {
  return texte.normalize('NFC').toLocaleLowerCase('fr').replace(/\s+/g, ' ').trim();
}

export interface CreationDansLaListe {
  readonly libelle: (texte: string) => string;
  readonly surCreation: (texte: string) => void;
}

function optionsAffichees(
  options: readonly OptionDeListe[],
  requete: string,
  texte: string,
  creation: CreationDansLaListe | undefined,
  connues: readonly OptionDeListe[],
): OptionDeListe[] {
  const r = replierPourRecherche(requete);
  const trouvees = r === '' ? [...options] : options.filter((o) => replierPourRecherche(o.label).includes(r));
  const saisi = texte.trim();
  const existe = connues.some((o) => replierPourIdentite(o.label) === replierPourIdentite(saisi));
  if (creation && saisi !== '' && !existe) trouvees.push({ value: VALEUR_CREER, label: creation.libelle(saisi) });
  return trouvees;
}

const CLASSE_SAISIE =
  'h-11 min-h-11 w-full rounded-lg border border-input bg-transparent py-2 pr-11 pl-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm';
const CLASSE_POPUP =
  'max-h-[min(var(--available-height),20rem)] w-(--anchor-width) min-w-56 overflow-y-auto rounded-lg bg-popover py-1 text-popover-foreground shadow-md ring-1 ring-border';
const CLASSE_ITEM =
  'relative flex min-h-11 w-full cursor-default items-center gap-2 py-1.5 pr-3 pl-8 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground';

function Deroulant({ aucunResultat, chargement }: { readonly aucunResultat: string; readonly chargement?: boolean }) {
  return (
    <Base.Portal>
      <Base.Positioner sideOffset={4} className="isolate z-[1100] outline-none">
        <Base.Popup className={CLASSE_POPUP}>
          <Base.Empty>
            {chargement ? null : <p className="px-3 py-2 text-sm text-muted-foreground">{aucunResultat}</p>}
          </Base.Empty>
          <Base.List>
            {(option: OptionDeListe) => (
              <Base.Item key={option.value} value={option} className={CLASSE_ITEM}>
                {option.value === VALEUR_CREER ? (
                  <Plus aria-hidden className="absolute left-2 size-4" />
                ) : (
                  <Base.ItemIndicator className="absolute left-2 flex size-4 items-center justify-center">
                    <Check aria-hidden className="size-4" />
                  </Base.ItemIndicator>
                )}
                {option.label}
                {option.indice ? <span className="text-xs text-muted-foreground"> · {option.indice}</span> : null}
              </Base.Item>
            )}
          </Base.List>
        </Base.Popup>
      </Base.Positioner>
    </Base.Portal>
  );
}

interface ProprietesCommunes {
  readonly options: readonly OptionDeListe[];
  readonly id?: string;
  /** Rendu en `aria-label` SEULEMENT s'il est fourni : un `<label htmlFor>` externe nomme déjà le champ. */
  readonly label?: string;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly chargement?: boolean;
  readonly aucunResultat: string;
  readonly creation?: CreationDansLaListe;
  readonly invalide?: boolean;
  readonly decritPar?: string;
  readonly required?: boolean;
  readonly className?: string;
}

export interface ComboboxProps extends ProprietesCommunes {
  readonly value: string | null;
  readonly onChange: (option: OptionDeListe | null) => void;
  /** Le texte EST une valeur (un quartier hors liste) : il vit dans le formulaire, pas ici. */
  readonly saisieLibre?: { readonly texte: string; readonly surSaisie: (texte: string) => void };
  /** Le `ref` de react-hook-form (`field.ref`) : c'est lui que `setFocus` et le focus d'erreur visent. */
  readonly inputRef?: Ref<HTMLInputElement>;
}

export function Combobox({
  options, value, onChange, id, label, placeholder, disabled, chargement, aucunResultat,
  creation, saisieLibre, inputRef, invalide, decritPar, required, className,
}: ComboboxProps) {
  const [ouvert, setOuvert] = useState(false);
  const [frappe, setFrappe] = useState<string | null>(null);
  const choisie = options.find((o) => o.value === value) ?? null;
  const texte = saisieLibre ? saisieLibre.texte : (frappe ?? choisie?.label ?? '');
  // Le libellé du choix courant n'est pas une recherche : à l'ouverture, toute la liste.
  const requete = choisie !== null && texte === choisie.label ? '' : texte;
  const items = optionsAffichees(options, requete, texte, creation, options);

  return (
    <Base.Root<OptionDeListe>
      items={items}
      filter={null}
      autoHighlight
      disabled={disabled}
      value={choisie}
      isItemEqualToValue={(a, b) => a.value === b.value}
      // Une liste VIDE ne s'ouvre pas : ouverte, la liste rend le reste de la page `aria-hidden`
      // (gestion du focus modale de Base UI quand la saisie est hors du popup) — pour n'y montrer
      // rien. Le référentiel indisponible laisse ainsi un champ texte ordinaire.
      open={ouvert && (options.length > 0 || items.length > 0)}
      onOpenChange={(suivant) => {
        setOuvert(suivant);
        if (!suivant) setFrappe(null);
      }}
      inputValue={texte}
      onInputValueChange={(suivant, { reason }) => {
        if (reason !== 'input-change') return;
        if (saisieLibre) saisieLibre.surSaisie(suivant);
        else setFrappe(suivant);
      }}
      onValueChange={(option, { reason }) => {
        // Échap, liste FERMÉE : Base UI vide la sélection (`input/ComboboxInput.js` L312-321).
        // Un geste pour fermer n'efface jamais un choix.
        if (reason === 'escape-key') return;
        setFrappe(null);
        if (option?.value === VALEUR_CREER) {
          creation?.surCreation(texte.trim());
          return;
        }
        // Le texte AVANT l'identifiant : `surSaisie` remet l'identifiant à null (taper efface le
        // choix), et l'appeler après `onChange` effacerait le choix qu'on vient de poser.
        if (saisieLibre && option) saisieLibre.surSaisie(option.label);
        onChange(option);
      }}
    >
      <Base.InputGroup className={cn('relative flex items-center', className)}>
        <Base.Input
          ref={inputRef}
          id={id}
          aria-label={label}
          aria-invalid={invalide || undefined}
          aria-describedby={decritPar}
          aria-required={required || undefined}
          placeholder={placeholder}
          className={CLASSE_SAISIE}
        />
        {/*
          Un chevron DÉCORATIF et non un `Combobox.Trigger` : la saisie ouvre déjà la liste au clic
          (`openOnInputClick`, vrai par défaut), et un bouton de plus par champ portait un
          `aria-expanded` que les tests du parcours prennent pour la bascule des détails d'adresse.
        */}
        <div className="pointer-events-none absolute right-3 flex h-full items-center gap-1 text-muted-foreground">
          {chargement ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
          <ChevronDown aria-hidden className="size-4" />
        </div>
      </Base.InputGroup>
      <Deroulant aucunResultat={aucunResultat} chargement={chargement} />
    </Base.Root>
  );
}

export interface ComboboxMultipleProps extends ProprietesCommunes {
  readonly valeurs: readonly OptionDeListe[];
  readonly onChange: (valeurs: OptionDeListe[]) => void;
  /** Le nom accessible du bouton qui retire une puce. */
  readonly retirer: (libelle: string) => string;
}

export function ComboboxMultiple({
  options, valeurs, onChange, id, label, placeholder, disabled, chargement, aucunResultat,
  creation, retirer, invalide, decritPar, className,
}: ComboboxMultipleProps) {
  const [ouvert, setOuvert] = useState(false);
  const [frappe, setFrappe] = useState('');
  const items = optionsAffichees(options, frappe, frappe, creation, [...options, ...valeurs]);

  return (
    <Base.Root<OptionDeListe, true>
      multiple
      items={items}
      filter={null}
      autoHighlight
      disabled={disabled}
      value={[...valeurs]}
      isItemEqualToValue={(a, b) => a.value === b.value}
      open={ouvert && (options.length > 0 || items.length > 0)}
      onOpenChange={(suivant) => {
        setOuvert(suivant);
        if (!suivant) setFrappe('');
      }}
      inputValue={frappe}
      onInputValueChange={(suivant, { reason }) => {
        if (reason === 'input-change') setFrappe(suivant);
      }}
      onValueChange={(suivantes, { reason }) => {
        // Même garde : sans elle, Échap liste fermée retirait TOUTES les puces d'un coup.
        if (reason === 'escape-key') return;
        const texte = frappe.trim();
        setFrappe('');
        if (suivantes.some((o) => o.value === VALEUR_CREER)) {
          creation?.surCreation(texte);
          return;
        }
        onChange(suivantes);
      }}
    >
      <Base.Chips
        className={cn(
          'flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input px-1.5 py-1 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring',
          invalide && 'border-destructive',
          className,
        )}
      >
        <Base.Value>
          {(choisies: OptionDeListe[]) =>
            choisies.map((option) => (
              <Base.Chip
                key={option.value}
                className="flex min-h-11 items-center gap-1 rounded-full bg-secondary pl-3 text-sm text-secondary-foreground"
              >
                {option.label}
                {option.indice ? <span className="text-xs text-muted-foreground">· {option.indice}</span> : null}
                <Base.ChipRemove
                  aria-label={retirer(option.label)}
                  className="flex size-11 min-h-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                >
                  <X aria-hidden className="size-3.5" />
                </Base.ChipRemove>
              </Base.Chip>
            ))
          }
        </Base.Value>
        <Base.Input
          id={id}
          aria-label={label}
          aria-invalid={invalide || undefined}
          aria-describedby={decritPar}
          placeholder={valeurs.length === 0 ? placeholder : undefined}
          className="h-11 min-h-11 min-w-32 flex-1 bg-transparent px-1.5 text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
        {chargement ? <Loader2 aria-hidden className="mr-1 size-4 animate-spin text-muted-foreground" /> : null}
      </Base.Chips>
      <Deroulant aucunResultat={aucunResultat} chargement={chargement} />
    </Base.Root>
  );
}
