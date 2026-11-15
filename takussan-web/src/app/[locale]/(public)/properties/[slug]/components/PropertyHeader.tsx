'use client';
import { useTranslations } from 'next-intl';
import { Star, Eye, Heart, Share2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CompareToggleAction } from '@/components/compare/CompareToggleAction';
import { porteUnBadgeNeuf } from '@/components/property/cards/NewBuildChip';
import { MarquesDeBoost } from '@/components/boost/MarquesDeBoost';
import { PROPERTY_ENUM_NAMESPACES } from '@/components/property-form/options';
import { formatAddressShort } from '@/lib/format/address';
import { statutPourLeVisiteur } from '@/lib/biens/statut-au-visiteur';
import type { PropertyDetail } from '@/types/property';
import { PropertyPrice } from './PropertyContactActions';

interface PropertyHeaderProps {
  property: PropertyDetail;
  onToggleFavorite: () => void;
  onShare: () => void;
  isFavorite: boolean;
}

export function PropertyHeader({ property, onToggleFavorite, onShare, isFavorite }: PropertyHeaderProps) {
  const t = useTranslations('propertyDetail');
  const tCondition = useTranslations(PROPERTY_ENUM_NAMESPACES.condition);
  const statutDuBien = statutPourLeVisiteur(property);

  return (
    <header className="flex flex-col gap-3">
      {/* TCK-2501 — sous `md`, les actions se posent au bout de la rangée des pastilles au lieu
          d'occuper leur propre ligne : 52 px rendus au premier écran.
          TCK-2503 — sous `md`, partager et favori sont sur la photo (`GestesSurPhoto`) : il ne reste
          ici que le comparateur. */}
      <div className="relative flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="space-y-2 min-w-0">
          {/* TCK-2501 — le prix d'abord, sous `lg` : la carte de réservation le porte en bureau. */}
          <PropertyPrice
            property={property}
            className="lg:hidden text-[1.75rem] leading-none tracking-tight"
            periodeClassName="text-base tracking-normal"
          />
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
          <div className="flex min-h-10 flex-wrap items-center gap-2 pr-14 md:min-h-0 md:pr-0">
            {/* TCK-2501 — « À louer » / « À vendre », que la carte de réservation porte sous le prix en
                bureau : sous `lg`, une pastille de plus sur la rangée, qui ne coûte aucune ligne. */}
            {property.contract_type_label && (
              <Badge variant="outline" className="lg:hidden">{property.contract_type_label}</Badge>
            )}
            {/* TCK-2638 — ni « Validé » ni « Disponible » au visiteur : seulement un statut qui l'informe. */}
            {statutDuBien ? <Badge variant="outline">{statutDuBien}</Badge> : null}
            {/* TCK-633 lot F — « En vedette » et le badge acheté (« Urgent », « Baisse de prix »). */}
            <MarquesDeBoost featured={Boolean(property.featured)} badge={(property as { badge?: unknown }).badge} className="contents" />
            {/* TCK-508 — « Neuf » / « Sur plan » seulement ; l'état complet est dans les caractéristiques. */}
            {porteUnBadgeNeuf(property.condition) && (
              <Badge variant="secondary">{tCondition(property.condition)}</Badge>
            )}
          </div>
        </div>

        <div className="absolute bottom-0 -right-2.5 flex items-center gap-1 shrink-0 md:static md:right-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={onShare}
            aria-label={t('shareAria')}
            className="hidden gap-2 md:inline-flex"
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
            className="hidden gap-2 md:inline-flex"
          >
            <Heart
              // TCK-2503 — le cœur plein est terracotta (`--primary`) partout, comme `FavoriteButton`.
              className={`size-4 ${isFavorite ? 'fill-current text-primary' : ''}`}
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
