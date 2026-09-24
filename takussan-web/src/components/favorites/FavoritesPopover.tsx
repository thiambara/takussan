'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { PropertyPhoto } from '@/components/property/cards/PropertyPhoto';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { Heart, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { useAuth } from '@/context/AuthContext';
import {
  useFavorites,
  remove as storeRemove,
} from '@/lib/favoritesStore';
import {
  usePropertiesByIdsQuery,
  useRemoveFavoriteMutation,
} from '@/lib/queries/favorites';
import { formatPrice } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { ZONE_TACTILE_44 } from '@/lib/zone-tactile';
import type { PropertyListItem } from '@/types/property';

const POPOVER_MAX_ITEMS = 5;
// Backend cap on /public/properties/by-ids — see PublicPropertyController.
const BY_IDS_LOOKUP_CAP = 20;
export interface FavoritesPopoverProps {
  /** Compact variant for the mobile slot (square button, no label). */
  variant?: 'default' | 'compact';
  className?: string;
}

export function FavoritesPopover({ variant = 'default', className }: FavoritesPopoverProps) {
  const t = useTranslations('favorites');
  const { user } = useAuth();
  const { ids, isHydrated, count } = useFavorites();
  const [open, setOpen] = useState(false);

  // Most recent IDs first, capped to the backend lookup limit.
  const lookupIds = [...ids].reverse().slice(0, BY_IDS_LOOKUP_CAP);
  const lookupQuery = usePropertiesByIdsQuery(lookupIds);

  // Purge ghosts (unpublished / deleted) from the store.
  useEffect(() => {
    if (!lookupQuery.data) return;
    const requested = new Set(lookupQuery.data.meta.requested_ids);
    const returned = new Set(lookupQuery.data.meta.returned_ids);
    requested.forEach((id) => {
      if (!returned.has(id)) storeRemove(id);
    });
  }, [lookupQuery.data]);

  const handleItemClick = useCallback(() => setOpen(false), []);

  // Don't paint the badge until hydrated to avoid SSR/CSR mismatch.
  const showBadge = isHydrated && count > 0;
  const isCompact = variant === 'compact';

  /*
   * TCK-569 (M4, retour testeur du 2026-09-23) — le panneau est celui de la primitive `Popover`
   * (base-ui), et non plus un `absolute right-0 w-80` accroché au bouton.
   *
   * Sur la barre mobile, le cœur n'est pas au bord de l'écran : le bouton menu (44 px), l'écart
   * (8 px) et la gouttière (16 px) le suivent. Un panneau de 320 px aligné sur son bord droit
   * commençait donc à x = −68 à 320 px (la largeur CSS de l'iPhone du testeur, en zoom
   * d'affichage), −28 à 360, +2 à 390 (mesuré au navigateur) : titre et lien « Voir tous mes
   * favoris » coupés à gauche, comme sur la capture. Après : 16 px de chaque bord aux trois
   * largeurs (panneau de 288 px à 320), et rien ne change en bureau (711..1095 à 1366).
   *
   * Le positionneur aligne le panneau sur le cœur PUIS le recale dans l'écran, à
   * `collisionPadding` des bords — la gouttière des pages. `max-w` garde la largeur sous celle de
   * l'écran moins deux gouttières. La primitive apporte aussi ce que le panneau écrit à la main
   * n'avait pas : Échap, retour du focus au cœur, fermeture quand le focus le quitte.
   */
  return (
    <div className={cn('relative', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label={t('button.aria')}
          className={cn(
            'relative inline-flex items-center justify-center rounded-full transition-colors',
            // TCK-551 (N8) — 36 px dessinés (`p-2` + icône de 20), 44 px touchables : c'était la
            // seule cible de la barre mobile sous le seuil, à côté d'un bouton menu de 44 × 44.
            isCompact
              ? cn('p-2 text-muted-foreground hover:text-primary hover:bg-muted', ZONE_TACTILE_44)
              : 'size-9 text-foreground hover:text-primary hover:bg-muted',
          )}
        >
          <Heart className={cn(isCompact ? 'w-5 h-5' : 'w-[18px] h-[18px]', showBadge && 'fill-destructive text-destructive')} />
          {showBadge && (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center"
            >
              {count > 99 ? '99+' : count}
            </span>
          )}
        </PopoverTrigger>

        <PopoverContent
          align="end"
          sideOffset={8}
          collisionPadding={16}
          // TCK-572 (solde de TCK-569) — l'appui à côté ferme le panneau et rien d'autre : sans
          // voile, il tombait aussi sur la carte dessous et ouvrait sa fiche (mesuré à 320 px).
          voile
          aria-label={t('popover.title')}
          className="w-80 sm:w-96 max-w-[calc(100vw-2rem)] p-0 overflow-hidden rounded-2xl shadow-xl ring-border"
        >
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">{t('popover.title')}</p>
            <p className="text-xs text-muted-foreground">{t('popover.count', { count })}</p>
          </div>

          <PopoverBody
            count={count}
            items={lookupQuery.data?.data}
            isLoading={lookupQuery.isLoading}
            onItemClick={handleItemClick}
          />

          {count > 0 && (
            <div className="px-4 py-2.5 border-t border-border">
              <LienLocalise
                href={user ? '/app/favorites' : '/favorites'}
                onClick={handleItemClick}
                className="text-xs font-semibold text-primary hover:underline underline-offset-2"
              >
                {t('popover.viewAll')}
              </LienLocalise>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ─── Popover body ─────────────────────────────────────────────────────────

interface PopoverBodyProps {
  count: number;
  items: PropertyListItem[] | undefined;
  isLoading: boolean;
  onItemClick: () => void;
}

function PopoverBody({ count, items, isLoading, onItemClick }: PopoverBodyProps) {
  const t = useTranslations('favorites.popover');
  const { user } = useAuth();
  const removeMutation = useRemoveFavoriteMutation();

  const removeOne = useCallback(
    (id: number) => {
      // Optimistic store flip — the heart everywhere reflects it instantly.
      storeRemove(id);
      if (user) {
        removeMutation.mutate({ property_id: id });
      }
    },
    [user, removeMutation],
  );

  if (isLoading && count > 0 && !items) {
    return (
      <div className="p-3 space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  const isEmpty = count === 0 || (items?.length ?? 0) === 0;

  if (isEmpty) {
    return (
      <div className="px-4 py-6 text-center">
        <Heart className="mx-auto w-8 h-8 text-muted-foreground/40" />
        <p className="mt-2 text-sm font-semibold text-foreground">{t('empty')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('emptyHint')}</p>
        <LienLocalise
          href="/properties"
          onClick={onItemClick}
          className="mt-3 inline-block text-xs font-semibold text-primary hover:underline underline-offset-2"
        >
          {t('discoverCta')}
        </LienLocalise>
      </div>
    );
  }

  return (
    <ul className="max-h-96 overflow-y-auto py-1">
      {(items ?? []).slice(0, POPOVER_MAX_ITEMS).map((property) => (
        <li key={property.id} className="group flex items-center gap-3 px-3 py-2 hover:bg-muted/60 transition-colors">
          <LienLocalise
            href={`/properties/${property.slug}`}
            onClick={onItemClick}
            className="flex flex-1 items-center gap-3 min-w-0"
          >
            <div className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-muted">
              <PropertyPhoto src={property.main_photo_url} alt="" sizes="48px" compact />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground truncate">
                {property.title}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {[property.location.quarter, property.location.city].filter(Boolean).join(', ')}
              </p>
              <p className="text-xs font-semibold text-primary mt-0.5">
                {formatPrice(property.price, property.currency ?? 'XOF')}
              </p>
            </div>
          </LienLocalise>
          <button
            type="button"
            onClick={() => removeOne(property.id)}
            aria-label={t('removeAria')}
            className="shrink-0 p-1.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
