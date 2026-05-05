'use client';
import { Star, Eye, Heart, Share2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatAddressShort } from '@/lib/format/address';
import type { PropertyDetail } from '@/types/property';

interface PropertyHeaderProps {
  property: PropertyDetail;
  onToggleFavorite: () => void;
  onShare: () => void;
  isFavorite: boolean;
}

export function PropertyHeader({ property, onToggleFavorite, onShare, isFavorite }: PropertyHeaderProps) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-col-reverse md:flex-row md:items-start md:justify-between gap-3">
        <div className="space-y-2 min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold text-stone-900 leading-tight">
            {property.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-600">
            {property.average_rating !== null && property.reviews_count > 0 && (
              <span className="inline-flex items-center gap-1">
                <Star className="size-4 fill-current text-amber-500" aria-hidden />
                <span className="font-medium text-stone-900">{property.average_rating.toFixed(1)}</span>
                <span className="text-stone-500">({property.reviews_count} avis)</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-4" aria-hidden />
              <span>{formatAddressShort(property.location, { fallback: property.location.full })}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-stone-500">
              <Eye className="size-4" aria-hidden />
              {property.views_count} vues
            </span>
            {property.reference_number && (
              <span className="text-stone-400 text-xs">Réf. {property.reference_number}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{property.status_label}</Badge>
            {property.featured && <Badge variant="default">Mis en avant</Badge>}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onShare}
            aria-label="Partager ce bien"
            className="gap-2"
          >
            <Share2 className="size-4" aria-hidden />
            <span className="hidden sm:inline">Partager</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleFavorite}
            aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            aria-pressed={isFavorite}
            className="gap-2"
          >
            <Heart
              className={`size-4 ${isFavorite ? 'fill-red-500 text-red-500' : ''}`}
              aria-hidden
            />
            <span className="hidden sm:inline">{isFavorite ? 'Favori' : 'Ajouter'}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
