'use client';

import { useId, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { useDebouncedCallback } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';

/** Le délai de frappe avant que la recherche parte au serveur. */
const DELAI_DE_FRAPPE = 300;

/** TCK-2769 — la recherche du coffre lue dans l'URL : `?q=` (sans espaces autour) et `?page=` (1 par défaut). */
export function useRechercheDansLURL(): { readonly q: string; readonly page: number } {
  const params = useSearchParams();
  const page = Number.parseInt(params.get('page') ?? '', 10);
  return { q: (params.get('q') ?? '').trim(), page: Number.isFinite(page) && page > 1 ? page : 1 };
}

/**
 * Écrit la recherche (et la page) dans l'URL, sans entrée d'historique par frappe.
 *
 * Par `window.history.replaceState`, que Next relie à `useSearchParams` sans requête au serveur : un
 * `router.replace` referait le rendu serveur de la page (`force-dynamic`) et pourrait remonter son
 * repli de chargement, champ compris, au milieu de la frappe.
 */
export function useEcrireLaRecherche() {
  const chemin = usePathname();
  const params = useSearchParams();

  return (q: string, page = 1) => {
    const suivants = new URLSearchParams(params.toString());
    if (q.trim() === '') suivants.delete('q');
    else suivants.set('q', q.trim());
    if (page > 1 && q.trim() !== '') suivants.set('page', String(page));
    else suivants.delete('page');
    const qs = suivants.toString();
    window.history.replaceState(null, '', qs ? `${chemin}?${qs}` : chemin);
  };
}

/**
 * TCK-2769 — « Chercher un document », le champ de la maquette (`app-documents` a, `ChampRecherche`) :
 * 44 px de large au téléphone sous l'en-tête, 36 px et 256 px dans l'en-tête au bureau.
 *
 * La requête part au SERVEUR (`filter[search]` de `GET /api/me/document-vault`) : ce champ ne fait
 * qu'écrire `?q=` dans l'URL, après une courte pause de frappe, ou tout de suite à la validation.
 */
export function ChampDeRecherche({ bureau }: { readonly bureau: boolean }) {
  const t = useTranslations('documents.coffre.recherche');
  const id = useId();
  const { q } = useRechercheDansLURL();
  const ecrireDansLURL = useEcrireLaRecherche();
  const [saisie, setSaisie] = useState(q);
  // L'URL peut changer sans la frappe (retour arrière, lien) : la saisie la suit alors. Elle ne suit
  // JAMAIS l'écho de ce que ce champ a lui-même écrit — même rendu après une frappe de plus (« quittance »
  // arrivé pendant qu'on tape « quittance d ») : le champ n'est pas remonté, il garde focus, clavier
  // et saisie.
  const [qVu, setQVu] = useState(q);
  const [ecrite, setEcrite] = useState(q);
  if (q !== qVu) {
    setQVu(q);
    if (q !== ecrite) setSaisie(q);
  }
  const ecrire = (valeur: string) => {
    setEcrite(valeur.trim());
    ecrireDansLURL(valeur);
  };
  const differee = useDebouncedCallback((valeur: string) => ecrire(valeur), DELAI_DE_FRAPPE);

  const changer = (valeur: string) => {
    setSaisie(valeur);
    differee.call(valeur);
  };

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        differee.cancel();
        ecrire(saisie);
      }}
      className={cn(
        'flex items-center gap-2 rounded-lg border border-border bg-card px-3 text-muted-foreground focus-within:border-ring focus-within:ring-3 focus-within:ring-ring',
        bureau ? 'h-9 w-64' : 'h-11 w-full',
      )}
    >
      <label htmlFor={id} className="sr-only">
        {t('champ')}
      </label>
      <Search className={cn('flex-none', bureau ? 'size-4' : 'size-icone')} strokeWidth={1.75} aria-hidden="true" />
      <Input
        id={id}
        type="search"
        value={saisie}
        onChange={(e) => changer(e.target.value)}
        placeholder={t('champ')}
        autoComplete="off"
        enterKeyHint="search"
        className="min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 text-foreground focus-visible:ring-0 dark:bg-transparent [&::-webkit-search-cancel-button]:hidden"
      />
      {saisie.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            setSaisie('');
            differee.cancel();
            ecrire('');
          }}
          aria-label={t('effacer')}
          className="-mr-1.5 inline-flex size-8 flex-none items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </form>
  );
}
