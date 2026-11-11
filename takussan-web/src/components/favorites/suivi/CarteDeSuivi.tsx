'use client';

import type { ReactNode } from 'react';
import { Loader2, SearchX, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { CompareToggleButton } from '@/components/compare/CompareToggleButton';
import { FavoriteButton } from '@/components/favorites/FavoriteButton';
import { PropertyPhoto } from '@/components/property/cards/PropertyPhoto';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { buttonVariants } from '@/components/ui/button';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import type { PropertyListItem } from '@/types/property';

import { GesteWhatsApp } from './GesteWhatsApp';
import { PastilleDEcart } from './PastilleDEcart';

/**
 * Vignette de 92 px au téléphone (rangée), 1/3 puis 1/4 de 1216 px au bureau (grille).
 * Déclarée ici : aucune grille de `card-image-sizes` n'a cette forme.
 */
const TAILLES_PHOTO = '(max-width: 1023px) 92px, (max-width: 1279px) 32vw, 290px';

/** Le conteneur d'une carte : rangée au téléphone, colonne dans la grille du bureau. */
export const ARTICLE_DE_SUIVI = 'flex min-w-0 gap-3.5 py-4 lg:h-full lg:flex-col lg:gap-0 lg:py-0';
const CADRE_PHOTO =
  'relative size-[92px] flex-none overflow-hidden rounded-xl bg-muted @container lg:aspect-4/3 lg:size-auto lg:w-full lg:rounded-2xl';

export interface CarteDeSuiviProps {
  readonly bien: PropertyListItem;
  /** L'écart de prix depuis la référence, ou `null` (aucune pastille). */
  readonly ecart: number | null | undefined;
  readonly depuis: 'ajout' | 'compte';
  /** La note personnelle (connecté) — déjà rendue par l'appelant. */
  readonly note?: ReactNode;
  readonly priorite?: boolean;
  /** Lien de « Visiter » : la fiche du bien. */
  readonly hrefVisite?: string;
}

function lieuDe(bien: PropertyListItem): string | null {
  return bien.location?.quarter ?? bien.location?.city ?? null;
}

/**
 * TCK-2508 — la carte d'un favori disponible : le prix d'abord, puis ce qui a changé, le titre et
 * le quartier, puis les deux gestes — Visiter et WhatsApp (décisions 3a et 4a de l'audit). Le
 * cœur sur la photo retire le favori, comme partout ailleurs (même magasin, même API).
 */
export function CarteDeSuivi({ bien, ecart, depuis, note, priorite = false, hrefVisite }: CarteDeSuiviProps) {
  const t = useTranslations('favorites.suivi');
  const tProperty = useTranslations('property');
  const tCards = useTranslations('property.cards');
  const { montant } = useFormatteurs();
  const fiche = `/properties/${encodeURIComponent(bien.slug)}`;
  const lieu = lieuDe(bien);

  return (
    <article data-testid="favori-suivi" data-property-id={bien.id} className={ARTICLE_DE_SUIVI}>
      <div className={CADRE_PHOTO}>
        {/* Le titre porte déjà le lien de la fiche : la photo en est un doublon pour la souris
            seulement, hors de l'ordre de tabulation et de l'arbre d'accessibilité. */}
        <LienLocalise href={fiche} tabIndex={-1} aria-hidden="true" className="absolute inset-0 block">
          <PropertyPhoto
            src={bien.main_photo_url}
            alt=""
            compact
            sizes={TAILLES_PHOTO}
            priority={priorite}
            className="object-cover"
          />
        </LienLocalise>
        <div className="absolute right-1 top-1 lg:right-2.5 lg:top-2.5">
          <FavoriteButton propertyId={bien.id} size="sm" prix={bien.price} />
        </div>
      </div>

      {/* Au bureau, une colonne qui remplit la cellule : les gestes se collent au pied de la carte,
          et « Visiter » tombe sur la même ligne d'une carte à l'autre, pastille ou non. */}
      <div className="min-w-0 flex-1 lg:mt-3 lg:flex lg:flex-col">
        <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <p className="font-display text-[1.0625rem] font-semibold tabular-nums lg:text-lg">
            <span className="whitespace-nowrap">{montant(bien.price, bien.currency)}</span>
            {bien.contract_type === 'rent' ? (
              <span className="whitespace-nowrap font-sans text-sm font-normal text-muted-foreground">
                {bien.rent_period
                  ? ` / ${tProperty(`rentPeriodsShort.${bien.rent_period}`)}`
                  : ` ${tCards('rentNoPeriod')}`}
              </span>
            ) : null}
          </p>
          <PastilleDEcart ecart={ecart} currency={bien.currency} depuis={depuis} />
        </div>
          {/* Le comparateur que la carte de liste portait (TCK-082) : la page n'en perd pas l'accès. */}
          <CompareToggleButton
            propertyId={bien.id}
            size="sm"
            surface="page"
            preview={{ title: bien.title, slug: bien.slug, photo: bien.main_photo_url }}
            className="-my-1 shrink-0"
          />
        </div>
        <LienLocalise href={fiche} className="block truncate text-sm text-muted-foreground hover:text-foreground lg:text-[0.9375rem]">
          {lieu ? t('titreEtLieu', { title: bien.title, lieu }) : bien.title}
        </LienLocalise>
        {note}
        <div className="mt-2.5 flex gap-2 lg:mt-auto lg:pt-3" data-testid="gestes-de-suivi">
          <LienLocalise
            href={hrefVisite ?? fiche}
            aria-label={t('visiterAria', { title: bien.title })}
            className={cn(buttonVariants({ size: 'sm' }), 'h-10 flex-1 bg-foreground text-background hover:bg-foreground/90')}
          >
            {t('visiter')}
          </LienLocalise>
          <GesteWhatsApp slug={bien.slug} title={bien.title} />
        </div>
      </div>
    </article>
  );
}

export interface CarteEteinteProps {
  /** Clé sous `favorites.page.availability` : `rented`, `sold`, `unavailable`, `removed`. */
  readonly raison: 'rented' | 'sold' | 'unavailable' | 'removed';
  readonly titre: string | null;
  /** « Biens proches » : la liste filtrée par ce que le bien était (`cheminDesBiensProches`). */
  readonly hrefProches?: string;
  readonly onRetirer: () => void;
  readonly retraitEnCours: boolean;
  readonly erreur: boolean;
}

/**
 * TCK-599 → TCK-2508 — un favori loué ou retiré reste visible, ÉTEINT : sa raison en clair, son
 * titre, ni prix ni lieu (l'API ne les rend plus), « Biens proches » et « Retirer ». Les filtres de
 * « Biens proches » sont ceux que l'appareil a vus du bien quand il était public.
 */
export function CarteEteinte({ raison, titre, hrefProches = '/properties', onRetirer, retraitEnCours, erreur }: CarteEteinteProps) {
  const t = useTranslations('favorites.page');
  const tSuivi = useTranslations('favorites.suivi');
  return (
    <article data-testid="favorite-unavailable" data-availability={raison} className={ARTICLE_DE_SUIVI}>
      <div className={cn(CADRE_PHOTO, 'flex items-center justify-center')}>
        <SearchX className="size-7 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1 lg:mt-3">
        <p className="text-[0.9375rem] font-semibold">{t(`availability.${raison}`)}</p>
        <p className="truncate text-sm text-muted-foreground lg:text-[0.9375rem]">{titre ?? t('removedTitle')}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <LienLocalise href={hrefProches} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-9')}>
            {tSuivi('biensProches')}
          </LienLocalise>
          <button
            type="button"
            onClick={onRetirer}
            disabled={retraitEnCours}
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-9 text-muted-foreground')}
          >
            {retraitEnCours ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="size-4" aria-hidden="true" />
            )}
            {t('remove')}
          </button>
        </div>
        {erreur ? (
          <p className="mt-1 text-xs text-destructive" role="alert">
            {t('removeError')}
          </p>
        ) : null}
      </div>
    </article>
  );
}
