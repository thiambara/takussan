'use client';
import { useTranslations } from 'next-intl';
import { Star, Eye, Heart, Share2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CompareToggleAction } from '@/components/compare/CompareToggleAction';
import { porteUnBadgeNeuf } from '@/components/property/cards/NewBuildChip';
import { PROPERTY_ENUM_NAMESPACES } from '@/components/property-form/options';
import { formatAddressShort } from '@/lib/format/address';
import type { PropertyDetail } from '@/types/property';

interface PropertyHeaderProps {
  property: PropertyDetail;
  onToggleFavorite: () => void;
  onShare: () => void;
  isFavorite: boolean;
}

export function PropertyHeader({ property, onToggleFavorite, onShare, isFavorite }: PropertyHeaderProps) {
  const t = useTranslations('property.detail');
  const tCondition = useTranslations(PROPERTY_ENUM_NAMESPACES.condition);

  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="space-y-2 min-w-0">
          <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight text-foreground leading-tight text-balance">
            {property.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground tabular-nums">
            {property.average_rating !== null && property.reviews_count > 0 && (
              <span className="inline-flex items-center gap-1">
                <Star className="size-4 fill-current text-primary" aria-hidden />
                <span className="font-medium text-foreground">{property.average_rating.toFixed(1)}</span>
                <span className="text-muted-foreground">{t('reviewsCount', { count: property.reviews_count })}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-4" aria-hidden />
              <span>{formatAddressShort(property.location, { fallback: property.location.full })}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Eye className="size-4" aria-hidden />
              {t('viewsCount', { count: property.views_count })}
            </span>
            {property.reference_number && (
              <span className="text-muted-foreground text-xs">{t('reference', { value: property.reference_number })}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{property.status_label}</Badge>
            {/* « Mis en avant » parle l'accent des badges featured (design-guidelines), pas le primaire des CTA. */}
            {property.featured && (
              <Badge variant="default" className="bg-accent text-accent-foreground">{t('featured')}</Badge>
            )}
            {/* TCK-508 — « Neuf » / « Sur plan » seulement ; l'état complet est dans les caractéristiques. */}
            {porteUnBadgeNeuf(property.condition) && (
              <Badge variant="secondary">{tCondition(property.condition)}</Badge>
            )}
          </div>
        </div>

        <div className="-ml-2.5 flex items-center gap-1 shrink-0 md:ml-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onShare}
            aria-label={t('shareAria')}
            className="gap-2 min-h-10 min-w-10 md:min-h-0 md:min-w-0"
          >
            <Share2 className="size-4" aria-hidden />
            <span className="hidden sm:inline">{t('share')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleFavorite}
            aria-label={isFavorite ? t('removeFavorite') : t('addFavorite')}
            aria-pressed={isFavorite}
            className="gap-2 min-h-10 min-w-10 md:min-h-0 md:min-w-0"
          >
            <Heart
              className={`size-4 ${isFavorite ? 'fill-destructive text-destructive' : ''}`}
              aria-hidden
            />
            <span className="hidden sm:inline">{isFavorite ? t('favoriteSavedShort') : t('favoriteAddShort')}</span>
          </Button>
          {/*
            Ajouter au comparateur DEPUIS LA FICHE — le chemin manquait, alors que l'état
            vide de `/compare` promettait déjà « depuis la liste ou la fiche d'un bien ».
            Jusqu'ici il fallait revenir à une liste de résultats pour sélectionner un bien
            qu'on était en train de lire.

            ⚠ EN DERNIER, après Partager et Favori : c'est l'ordre des cartes de liste
            (favori puis comparateur), et un utilisateur ne réapprend pas une rangée
            d'actions parce qu'il a changé d'écran.
          */}
          <CompareToggleAction
            propertyId={property.id}
            preview={{
              title: property.title,
              slug: property.slug,
              photo: property.main_photo_url,
            }}
          />
        </div>
      </div>
    </header>
  );
}
