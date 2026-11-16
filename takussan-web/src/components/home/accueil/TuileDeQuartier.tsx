'use client';

import { useState } from 'react';
import Image from 'next/image';

import { LienLocalise } from '@/components/shared/LienLocalise';
import { BogolanPattern } from '@/components/property/cards/BogolanPattern';
import { cn } from '@/lib/utils';

// ⚠ Aucun `useTranslations` ici : la console super-admin importe ce composant (aperçu de
// `/super-admin/geo`), et l'espace `homepage` n'y est pas servi (`check:i18n-namespaces`). Le compte
// arrive déjà traduit.

/**
 * Les largeurs réelles de la tuile : 132 px au téléphone, un quart de la grille dès `sm`, un huitième
 * dès `lg` (marges comprises, arrondies vers le haut — le loader arrondit encore à son palier).
 */
export const TAILLES_DE_TUILE = '(min-width: 1024px) 13vw, (min-width: 640px) 25vw, 132px';

export interface TuileDeQuartierProps {
  readonly nom: string;
  /** Le compte déjà traduit (« 12 annonces »). */
  readonly compte: string;
  readonly photo: string | null;
  readonly sizes: string;
  /** Avec un lien : la tuile de l'accueil. Sans : l'aperçu de la console (`/super-admin/geo`). */
  readonly href?: string;
  readonly className?: string;
}

/**
 * TCK-2844 — UNE tuile de quartier, partagée par l'accueil et par l'aperçu de la console : « vue
 * comme la tuile de l'accueil » (ADR-0109 §1) est une identité de composant, pas une copie.
 *
 * Avec photo : `TuileQuartier` de la maquette de l'accueil, au pixel — photo `object-cover` centrée,
 * dégradé `from-foreground/85 via-foreground/40`, nom et compte en `text-background`. Le décor est
 * `alt=""` : le nom est déjà dans le lien. `onError` sur `next/image` (et non un `<img>` brut) :
 * `image-component.js` relance le chargement (`img.src = img.src`) quand un `onError` est passé, ce
 * qui rattrape un échec survenu avant l'hydratation de cette page rendue côté serveur.
 */
export function TuileDeQuartier({ nom, compte, photo, sizes, href, className }: TuileDeQuartierProps) {
  const [enErreur, setEnErreur] = useState(false);
  const avecPhoto = photo !== null && !enErreur;

  const cadre = cn(
    'group relative isolate flex size-[132px] flex-col justify-end overflow-hidden rounded-xl sm:aspect-square sm:size-auto',
    avecPhoto ? 'bg-muted' : 'bg-secondary p-3',
    href ? 'transition-[box-shadow,scale] hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring' : null,
    className,
  );

  const contenu = avecPhoto ? (
    <>
      <Image
        src={photo}
        alt=""
        fill
        sizes={sizes}
        draggable={false}
        className="-z-10 object-cover object-center"
        onError={() => setEnErreur(true)}
      />
      {/* Le dégradé ne porte pas l'encre : un fond en dégradé n'est pas un jeton, et la garde de
          contraste de la surface publique le compterait « hors jetons ». L'encre claire est posée une
          fois, sur le texte ; le compte la garde à 85 % par `opacity-85` — même rendu que
          `text-background/85` de la maquette, une encre inverse de moins à compter. */}
      <span
        data-testid="degrade-de-tuile"
        className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-foreground/85 via-foreground/40 to-transparent p-3 pt-10"
      >
        <span className="flex flex-col text-background">
          <span className="font-display text-[1.0625rem] font-semibold leading-tight tracking-[-0.02em] line-clamp-2">{nom}</span>
          <span className="text-[0.8125rem] tabular-nums opacity-85">{compte}</span>
        </span>
      </span>
    </>
  ) : (
    <>
      <span aria-hidden="true" data-testid="motif-de-tuile" className="absolute inset-0 -z-10 text-foreground opacity-[0.06]">
        <BogolanPattern className="h-full w-full" color="currentColor" />
      </span>
      <span className="font-display text-[1.0625rem] font-semibold leading-tight tracking-[-0.02em] text-foreground line-clamp-2">
        {nom}
      </span>
      <span className="text-[0.8125rem] tabular-nums text-muted-foreground">{compte}</span>
    </>
  );

  if (href === undefined) return <div className={cadre}>{contenu}</div>;
  return (
    <LienLocalise href={href} prefetch={false} className={cadre}>
      {contenu}
    </LienLocalise>
  );
}
