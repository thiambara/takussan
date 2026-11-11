'use client';

import { Loader2, Search, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';

import { BarreDeChargement } from '@/components/shared/BarreDeChargement';
import { Input } from '@/components/ui/input';
import { fieldDensityScope } from '@/components/ui/field-density';
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
 * ⚠ Le champ de recherche est dans un `<form>` réel : `Entrée` (ou la touche « Rechercher » du
 * clavier du téléphone, `enterKeyHint`) le soumet. Sans `<form>`, elle ne ferait rien et le visiteur
 * croirait avoir cherché — le motif du formulaire de newsletter inerte que TCK-437 a retiré du pied
 * de page. TCK-2521 (maquette D) a retiré le bouton loupe à droite du champ : un formulaire à UN seul
 * champ texte se soumet à `Entrée` sans bouton (soumission implicite, HTML § 4.10.21.2), et le
 * champ garde son nom accessible. Ne pas lui ajouter un second champ texte sans remettre un bouton.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE CLIC SE VOIT AVANT LA PAGE SUIVANTE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * La page est rendue côté serveur, sans `loading.tsx` (le 404 du site public en dépend) : entre le
 * clic et la réponse, rien ne bougeait — « on a l'impression de ne pas avoir cliqué » (retour
 * d'administration du 2026-09-16). La navigation passe par `useTransition` : la ville demandée
 * s'allume au clic avec un indicateur, une barre court en haut de l'écran, et la racine porte
 * `data-en-cours`, que `IndexDeProfils` lit pour estomper les résultats périmés.
 */
export function ProfileFilters({ base, villes, placeholderRecherche }: Props) {
  const t = useTranslations('publicProfileIndex.filters');
  const router = useRouter();
  const locale = useLocale() as Locale;
  const params = useSearchParams();

  const villeDeLUrl = params.get('city') ?? '';
  const [recherche, setRecherche] = useState(params.get('q') ?? '');
  const [enCours, demarrer] = useTransition();
  const [villeDemandee, setVilleDemandee] = useState<string | null>(null);
  const villeCourante = enCours && villeDemandee !== null ? villeDemandee : villeDeLUrl;
  const rechercheDeLUrl = params.get('q') ?? '';
  const rangee = useRef<HTMLDivElement>(null);

  // TCK-2521 (revue) — la rangée de villes défile : une ville lointaine (Kaolack, à 940 px dans un
  // écran de 390) restait hors de la vue, et rien d'autre au téléphone ne dit quelle ville filtre.
  // Au chargement et à chaque ville de l'URL, on ramène sa puce dans la rangée — la rangée seule,
  // jamais la page (`scrollIntoView` ferait aussi défiler la page verticalement).
  useEffect(() => {
    const conteneur = rangee.current;
    const puce = conteneur?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!conteneur || !puce) return;
    const boite = conteneur.getBoundingClientRect();
    const cible = puce.getBoundingClientRect();
    if (cible.left >= boite.left && cible.right <= boite.right) return;
    const gauche = conteneur.scrollLeft + (cible.left - boite.left) - (boite.width - cible.width) / 2;
    conteneur.scrollLeft = Math.max(0, gauche);
  }, [villeDeLUrl]);

  function naviguer(modifications: Record<string, string>) {
    const prochains = new URLSearchParams(params.toString());
    for (const [cle, valeur] of Object.entries(modifications)) {
      if (valeur === '') prochains.delete(cle);
      else prochains.set(cle, valeur);
    }
    prochains.delete('page');
    const chaine = prochains.toString();
    setVilleDemandee('city' in modifications ? modifications.city! : null);
    demarrer(() => router.push(hrefLocalise(chaine === '' ? base : `${base}?${chaine}`, locale)));
  }

  function soumettre(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    naviguer({ q: recherche.trim() });
  }

  return (
    // TCK-2521 — au téléphone, le champ puis UNE rangée de villes qui défile (onze villes sur trois
    // lignes repoussaient le premier résultat à 716 px) ; en bureau, les deux sur la même rangée.
    <div {...fieldDensityScope()} className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:gap-4" data-en-cours={enCours || undefined} aria-busy={enCours}>
      {enCours && <BarreDeChargement libelle={t('loading')} position="ecran" />}
      <form onSubmit={soumettre} role="search" className="flex gap-2 lg:w-[400px] lg:flex-none">
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
            enterKeyHint="search"
            // TCK-573 — 40 px au bureau À LA SOURIS seulement : sur une tablette tactile (768,
            // 1024), `md:h-10` seul rendait le champ à 40 px, sous la cible de 44 (mesuré). Sans
            // bouton à côté (TCK-2521), le champ a toute la largeur : à 320 px, son texte
            // d'exemple n'est plus coupé.
            className="pl-9 pr-9"
          />
          {/* La recherche en cours se voit dans le champ, là où était le bouton. */}
          {enCours && villeDemandee === null && (
            <Loader2
              className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
              aria-hidden
            />
          )}
        </div>
      </form>

      {villes.length > 0 && (
        <div
          ref={rangee}
          // En bureau, la maquette D garde les villes sur UNE rangée coupée : la coupure se signale
          // par un fondu sur le bord droit (revue du 2026-11-09 : à 1440, la rangée était tranchée
          // net, sans signe qu'elle défile). `lg:pr-24` laisse la dernière puce hors du fondu une fois
          // la rangée défilée jusqu'au bout. Au téléphone, la rangée sort du cadre (`-mx-4`) : le
          // bord de l'écran signale déjà la suite, rien ne change.
          className="-mx-4 -my-1 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:min-w-0 lg:flex-1 lg:pl-0 lg:pr-24 lg:[mask-image:linear-gradient(to_right,#000_calc(100%-var(--spacing)*24),transparent)] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label={t('cityGroupAria')}
        >
          <CityChip
            actif={villeCourante === ''}
            enAttente={enCours && villeDemandee === ''}
            libelle={t('allCities')}
            onClick={() => naviguer({ city: '' })}
          />
          {villes.map((ville) => (
            <CityChip
              key={ville}
              actif={memeVille(villeCourante, ville)}
              enAttente={enCours && villeDemandee === ville}
              libelle={ville}
              onClick={() => naviguer({ city: memeVille(villeCourante, ville) ? '' : ville })}
            />
          ))}
        </div>
      )}

      {/* TCK-2521 (décision de la session, 2026-11-09) — seulement sur une recherche par nom : la
          puce « Toutes » défait déjà la ville, et ce bouton ajoutait une rangée de 52 px à l'en-tête
          collant dès qu'une ville était choisie. Il retire toujours TOUS les critères. */}
      {rechercheDeLUrl !== '' && (
        <button
          type="button"
          onClick={() => {
            setRecherche('');
            naviguer({ city: '', q: '' });
          }}
          className="inline-flex min-h-11 w-fit items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline pointer-fine:min-h-9"
        >
          <X className="size-3.5" aria-hidden />
          {t('clear')}
        </button>
      )}
    </div>
  );
}

/**
 * TCK-2521 — le filtre serveur compare les villes sans tenir compte de la casse : `?city=dakar`
 * filtre sur Dakar (AC3), la puce « Dakar » doit donc s'allumer aussi.
 */
function memeVille(a: string, b: string): boolean {
  return a !== '' && a.toLocaleLowerCase() === b.toLocaleLowerCase();
}

function CityChip({
  actif,
  enAttente,
  libelle,
  onClick,
}: {
  readonly actif: boolean;
  readonly enAttente: boolean;
  readonly libelle: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={
        // TCK-573 — 44 px au doigt (`pointer: coarse`, tout téléphone et toute tablette), 36 px
        // à la souris : la puce mesurait 36 px partout, sous la cible tactile de 44.
        // TCK-2521 — les encres de la maquette D (`Pastille`) : la puce active en encre foncée, les
        // autres en encre du texte sur la carte. Deux couples du jeu de jetons, AA dans les deux thèmes.
        'inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-[color,background-color,border-color,scale] active:scale-[0.96] pointer-fine:min-h-9 ' +
        (actif
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-card text-foreground hover:border-foreground/40')
      }
    >
      {enAttente && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      {libelle}
    </button>
  );
}
