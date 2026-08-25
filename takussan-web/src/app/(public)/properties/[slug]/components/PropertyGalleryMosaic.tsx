'use client';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Grid3x3 } from 'lucide-react';
import type { PropertyPhoto } from '@/types/property';

interface PropertyGalleryMosaicProps {
  photos: PropertyPhoto[];
  title: string;
  onOpenLightbox: (startIndex: number) => void;
}

interface TileProps {
  photo: PropertyPhoto;
  alt: string;
  index: number;
  sizes: string;
  priority?: boolean;
  className?: string;
  onOpen: (index: number) => void;
}

function Tile({ photo, alt, index, sizes, priority, className, onOpen }: TileProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(index)}
      className={`relative group overflow-hidden ${className ?? ''}`}
    >
      <Image
        src={photo.full}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover group-hover:scale-[1.02] transition-transform duration-300"
      />
    </button>
  );
}

/**
 * `sizes` de la mosaïque — **mesurés le 2026-08-24, viewport 1920 × 1000**.
 *
 * La mosaïque raisonnait en `vw` (`50vw`, `25vw`, `60vw`, `40vw`) alors qu'elle vit
 * dans `max-w-7xl px-4 sm:px-6 lg:px-8` : au-delà de 1280 px le conteneur est figé à
 * **1216 px** et un `vw` n'y décrit plus rien. Relevé sur une fiche à 5 photos :
 *
 * | tuile | occupée à l'écran | `sizes` déclaré | largeur demandée |
 * |---|---|---|---|
 * | grande (`col-span-2 row-span-2`) | 604 px | `50vw` → 960 px | **w=1920** |
 * | petite (1 colonne) | 298 px | `25vw` → 480 px | **w=1080** |
 *
 * La grande tuile est l'image LCP de la fiche : elle demandait plus du triple de ce
 * qu'elle affiche, sur la requête qui décide du ressenti de la page.
 *
 * Géométrie : grille `grid-cols-4` à gouttière `gap-2` (8 px). Une colonne vaut
 * `(L − 3 × 8) / 4`, une tuile sur deux colonnes `2 × colonne + 8`. Avec L = 1216 px
 * une fois plafonné : 298 px et 604 px — ce que la mesure rend exactement. En
 * dessous de 1280 px, L = viewport − rembourrage, d'où les valeurs en `vw`.
 *
 * La mosaïque est `hidden md:grid` : aucun palier en dessous de 768 px n'est utile
 * ici — c'est `PropertyMobileGallery` qui sert, et son `100vw` est juste.
 *
 * ⚠ **TCK-356 — ces `sizes` ne servaient à rien tant que la SOURCE plafonnait.**
 * Les tuiles lisaient `photo.preview`, une conversion de 800 × 600 : demander
 * 1216 px à une source de 800 px rend une image agrandie, pas une image nette.
 * Elles lisent désormais `photo.full` (jusqu'à 1600 px). Les deux vont ensemble —
 * un `sizes` juste sur une source trop petite ne se voit dans aucun outil, l'image
 * est simplement floue.
 *
 * `full` pour TOUTES les tuiles, y compris les petites que `preview` couvrait :
 * `next/image` négocie de toute façon la largeur émise via `sizes`, donc les octets
 * envoyés au visiteur sont les mêmes, et une source unique par composant ne se
 * désynchronise pas de la mise en page au prochain remaniement de la grille.
 */
const TUILE_LARGE = '(max-width: 1279px) 48vw, 604px';
const TUILE_PETITE = '(max-width: 1279px) 24vw, 298px';

/** Disposition à deux photos : `grid-cols-[60fr_40fr]`, soit 725 px / 483 px au plafond. */
const TUILE_60 = '(max-width: 1279px) 58vw, 725px';
const TUILE_40 = '(max-width: 1279px) 39vw, 483px';

/**
 * Photo unique : la tuile occupe TOUTE la largeur du conteneur et, contrairement à
 * la mosaïque, n'est pas `hidden md:grid` — elle sert aussi sur mobile.
 * L'ancien `66vw` sous-estimait le besoin de 30 % à 1280 px (845 px déclarés pour
 * 1216 px occupés), ce qui rend flou au lieu de rendre lourd.
 */
const TUILE_PLEINE = '(max-width: 1279px) 95vw, 1216px';

export function PropertyGalleryMosaic({ photos, title, onOpenLightbox }: PropertyGalleryMosaicProps) {
  const t = useTranslations('property.detail');

  if (photos.length === 0) {
    return (
      <div className="aspect-[16/7] rounded-xl bg-stone-100 flex items-center justify-center text-stone-400">
        {t('gallery.noPhotoAvailable')}
      </div>
    );
  }

  if (photos.length === 1) {
    return (
      <Tile
        photo={photos[0]}
        alt={title}
        index={0}
        sizes={TUILE_PLEINE}
        priority
        onOpen={onOpenLightbox}
        className="w-full aspect-[16/7] rounded-xl"
      />
    );
  }

  // Helper alt builder.
  const altOf = (i: number) => (i === 0 ? title : `${title} - photo ${i + 1}`);

  return (
    <div className="relative">
      <div
        className={`hidden md:grid gap-2 aspect-[160/63] ${
          photos.length === 2
            ? 'grid-cols-[60fr_40fr]'
            : 'grid-cols-4 grid-rows-2'
        }`}
      >
        {photos.length === 2 && (
          <>
            <Tile photo={photos[0]} alt={altOf(0)} index={0} sizes={TUILE_60} priority onOpen={onOpenLightbox} className="rounded-l-xl" />
            <Tile photo={photos[1]} alt={altOf(1)} index={1} sizes={TUILE_40} onOpen={onOpenLightbox} className="rounded-r-xl" />
          </>
        )}

        {photos.length === 3 && (
          <>
            <Tile
              photo={photos[0]}
              alt={altOf(0)}
              index={0}
              sizes={TUILE_LARGE}
              priority
              onOpen={onOpenLightbox}
              className="col-span-2 row-span-2 rounded-l-xl"
            />
            <Tile
              photo={photos[1]}
              alt={altOf(1)}
              index={1}
              sizes={TUILE_LARGE}
              onOpen={onOpenLightbox}
              className="col-span-2 rounded-tr-xl"
            />
            <Tile
              photo={photos[2]}
              alt={altOf(2)}
              index={2}
              sizes={TUILE_LARGE}
              onOpen={onOpenLightbox}
              className="col-span-2 rounded-br-xl"
            />
          </>
        )}

        {photos.length === 4 && (
          <>
            <Tile
              photo={photos[0]}
              alt={altOf(0)}
              index={0}
              sizes={TUILE_LARGE}
              priority
              onOpen={onOpenLightbox}
              className="col-span-2 row-span-2 rounded-l-xl"
            />
            <Tile
              photo={photos[1]}
              alt={altOf(1)}
              index={1}
              sizes={TUILE_LARGE}
              onOpen={onOpenLightbox}
              className="col-span-2 rounded-tr-xl"
            />
            <Tile photo={photos[2]} alt={altOf(2)} index={2} sizes={TUILE_PETITE} onOpen={onOpenLightbox} />
            <Tile photo={photos[3]} alt={altOf(3)} index={3} sizes={TUILE_PETITE} onOpen={onOpenLightbox} className="rounded-br-xl" />
          </>
        )}

        {photos.length >= 5 && (
          <>
            <Tile
              photo={photos[0]}
              alt={altOf(0)}
              index={0}
              sizes={TUILE_LARGE}
              priority
              onOpen={onOpenLightbox}
              className="col-span-2 row-span-2 rounded-l-xl"
            />
            <Tile photo={photos[1]} alt={altOf(1)} index={1} sizes={TUILE_PETITE} onOpen={onOpenLightbox} />
            <Tile photo={photos[2]} alt={altOf(2)} index={2} sizes={TUILE_PETITE} onOpen={onOpenLightbox} className="rounded-tr-xl" />
            <Tile photo={photos[3]} alt={altOf(3)} index={3} sizes={TUILE_PETITE} onOpen={onOpenLightbox} />
            <Tile photo={photos[4]} alt={altOf(4)} index={4} sizes={TUILE_PETITE} onOpen={onOpenLightbox} className="rounded-br-xl" />
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => onOpenLightbox(0)}
        className="absolute bottom-4 right-4 hidden md:inline-flex items-center gap-2 rounded-md bg-white/95 px-4 py-2 text-sm font-medium text-stone-900 shadow-md backdrop-blur hover:bg-white transition-colors"
      >
        <Grid3x3 className="size-4" aria-hidden />
        {t('gallery.viewAll', { count: photos.length })}
      </button>
    </div>
  );
}
