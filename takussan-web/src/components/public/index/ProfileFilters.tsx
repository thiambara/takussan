'use client';

import { Search, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { hrefLocalise } from '@/i18n/navigation';
import type { Locale } from '@/i18n/config';

type Props = {
  /** `/agencies` ou `/agents`, SANS langue — `hrefLocalise` l'ajoute. */
  readonly base: string;
  /** La facette servie par l'API. Jamais composée ici : le catalogue bouge sans que le dépôt change. */
  readonly villes: readonly string[];
  readonly placeholderRecherche: string;
};

/**
 * La recherche et le filtre par ville des deux index — TCK-436.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * IL ÉCRIT DANS L'URL, IL NE FILTRE RIEN
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le composant ne connaît pas la liste des profils et n'y a pas accès : il pousse `?q=` et
 * `?city=` dans l'URL, la page serveur relit ces paramètres et les transmet à l'API en
 * `filter[search]` / `filter[city]`. C'est la règle du dépôt — *filtrer côté serveur, jamais côté
 * client sur une liste déjà récupérée* — et ici elle a une conséquence visible : le filtre porte
 * sur le catalogue ENTIER, pas sur les dix-huit profils de la page courante.
 *
 * ⚠ `page` est retiré à chaque changement de critère. Rester sur `?page=4` en changeant de ville
 * donne une page vide sur un jeu de résultats qui, lui, n'est pas vide — un « aucun résultat »
 * faux, exactement ce que le § Direction UX du ticket demande d'éviter.
 *
 * ⚠ Le champ de recherche est dans un `<form>` réel, avec un bouton de soumission : sans lui,
 * `Entrée` ne fait rien et le visiteur croit avoir cherché. C'est le motif du formulaire de
 * newsletter inerte que TCK-437 vient de retirer du pied de page.
 */
export function ProfileFilters({ base, villes, placeholderRecherche }: Props) {
  const t = useTranslations('publicProfileIndex.filters');
  const router = useRouter();
  const locale = useLocale() as Locale;
  const params = useSearchParams();

  const villeCourante = params.get('city') ?? '';
  const [recherche, setRecherche] = useState(params.get('q') ?? '');

  function naviguer(modifications: Record<string, string>) {
    const prochains = new URLSearchParams(params.toString());
    for (const [cle, valeur] of Object.entries(modifications)) {
      if (valeur === '') prochains.delete(cle);
      else prochains.set(cle, valeur);
    }
    prochains.delete('page');
    const chaine = prochains.toString();
    router.push(hrefLocalise(chaine === '' ? base : `${base}?${chaine}`, locale));
  }

  function soumettre(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    naviguer({ q: recherche.trim() });
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={soumettre} role="search" className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            name="q"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder={placeholderRecherche}
            aria-label={placeholderRecherche}
            className="pl-9"
          />
        </div>
        <Button type="submit">{t('submit')}</Button>
      </form>

      {villes.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('cityGroupAria')}>
          <CityChip
            actif={villeCourante === ''}
            libelle={t('allCities')}
            onClick={() => naviguer({ city: '' })}
          />
          {villes.map((ville) => (
            <CityChip
              key={ville}
              actif={villeCourante === ville}
              libelle={ville}
              onClick={() => naviguer({ city: villeCourante === ville ? '' : ville })}
            />
          ))}
        </div>
      )}

      {(villeCourante !== '' || (params.get('q') ?? '') !== '') && (
        <button
          type="button"
          onClick={() => {
            setRecherche('');
            naviguer({ city: '', q: '' });
          }}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <X className="size-3.5" aria-hidden />
          {t('clear')}
        </button>
      )}
    </div>
  );
}

function CityChip({
  actif,
  libelle,
  onClick,
}: {
  readonly actif: boolean;
  readonly libelle: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={
        'rounded-full border px-3 py-1.5 text-sm transition-colors ' +
        (actif
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground')
      }
    >
      {libelle}
    </button>
  );
}
