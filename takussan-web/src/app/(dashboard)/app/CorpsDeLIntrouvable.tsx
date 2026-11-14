import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Search, SearchX } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { cn } from '@/lib/utils';
import { RetourVersLaListe } from './RetourVersLaListe';
import { ListeDeSecours } from './SecoursDeLIntrouvable';

/** Un seul introuvable par page : des identifiants fixes relient le champ (serveur) à sa liste (client). */
const ID_CHAMP = 'aller-a-dans-la-page';
const ID_LISTE = 'secours-de-l-introuvable';

/**
 * La primitive `Input`, hauteur et texte compris (portée `/app` : 44 px sous le pouce, `h-9` au bureau).
 * La maquette dessine ce champ à 48 / 43,2 px avec un halo : ADR-0106 § 2 (c), une primitive n'a qu'un
 * dessin, et `check-champs-uniformes` (TCK-2460) refuse une hauteur écrite chez l'appelant. Seul le
 * retrait de gauche, pour la loupe, est d'ici.
 */
const STYLE_CHAMP = 'pl-11';

/**
 * Second derrière « Revenir à la liste » quand elle existe (maquette, bureau : discret), seul en
 * contour sinon. Le serveur ne connaît pas l'URL demandée (un introuvable ne reçoit rien) : c'est le
 * voisin rendu par `RetourVersLaListe` qui fait passer le contour au discret, en CSS.
 */
const STYLE_RETOUR =
  '[[data-slot=retour-a-la-liste]~&]:border-transparent [[data-slot=retour-a-la-liste]~&]:bg-transparent [[data-slot=retour-a-la-liste]~&]:text-encre-discrete max-md:h-12 max-md:w-full max-md:text-corps';

/**
 * TCK-2619 — le corps de l'introuvable de `/app`, composant SERVEUR (cf. `not-found.tsx`). ⚠ Ce qu'il
 * rend n'est PAS dans le HTML de la réponse 404 : Next 16 ne rend jamais au serveur un introuvable
 * atteint par `notFound()`, l'écran arrive à l'hydratation (mesure du 2026-11-14, TCK-2740). Le champ est un vrai
 * formulaire de recherche, sans état React : `ListeDeSecours` (client) l'écoute par son identifiant,
 * filtre l'index de la palette à la saisie et ouvre la première page à Entrée.
 */
export function CorpsDeLIntrouvable({ aujourdhui }: { readonly aujourdhui: boolean }) {
  const t = useTranslations('dashboard.notFound');
  const tPalette = useTranslations('nav.palette');
  const titre = t('heading');

  return (
    <div data-testid="app-not-found" className="mx-auto w-full max-w-[1104px] max-md:pt-2 max-md:text-center">
      {/* Au téléphone, l'en-tête de la coque prend le titre en H1 (forme `racine`, avec ou sans liste
          parente : la flèche de retour serait un second « Retour à la liste »). */}
      <DeclarerEnTete titre={titre} forme="racine" />
      <span className="mx-auto inline-flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground md:hidden">
        <SearchX className="size-7" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <h1 className="font-display text-2xl font-semibold tracking-titre text-balance text-foreground max-md:mt-4 max-md:text-xl">
        {titre}
      </h1>
      <div className="max-md:mt-4 md:mt-1 md:text-sm md:text-muted-foreground">
        <p className="max-md:text-base max-md:font-semibold max-md:text-foreground md:inline">{t('description')}</p>{' '}
        <p className="max-md:mx-auto max-md:mt-1 max-md:max-w-xs max-md:text-sm max-md:text-muted-foreground md:inline">
          {t('aide')}
        </p>
      </div>
      <div className="mt-5 md:mt-6 md:max-w-[480px]">
        <form role="search" className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.5}
            aria-hidden
          />
          <Input
            id={ID_CHAMP}
            type="search"
            data-slot="aller-a-dans-la-page"
            aria-label={tPalette('champ')}
            aria-controls={ID_LISTE}
            placeholder={tPalette('placeholder')}
            maxLength={80}
            autoComplete="off"
            className={STYLE_CHAMP}
          />
        </form>
        <ListeDeSecours idChamp={ID_CHAMP} idListe={ID_LISTE} />
        <div className="mt-5 flex flex-col gap-2 md:flex-row md:flex-wrap">
          <RetourVersLaListe />
          <Link
            href="/app"
            data-slot="retour-a-l-accueil"
            className={cn(buttonVariants({ variant: 'outline' }), STYLE_RETOUR)}
          >
            {t(aujourdhui ? 'backToday' : 'backHome')}
          </Link>
        </div>
      </div>
    </div>
  );
}
