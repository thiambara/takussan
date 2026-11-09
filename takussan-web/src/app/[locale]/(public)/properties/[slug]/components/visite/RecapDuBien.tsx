'use client';
import Image from 'next/image';
import { ImageOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import type { PropertyDetail } from '@/types/property';

export type BienDeLaVisite = Pick<
  PropertyDetail,
  'slug' | 'title' | 'photos' | 'price' | 'currency' | 'contract_type' | 'rent_period' | 'location'
>;

/** TCK-2503 — le bien en tête de chaque écran de la demande : on sait toujours pour quoi on demande. */
export function RecapDuBien({
  property,
  compact = false,
  className,
}: {
  readonly property: BienDeLaVisite;
  /** Vignette réduite : l'écran de suite doit tenir à 360 × 740 sans défiler. */
  readonly compact?: boolean;
  readonly className?: string;
}) {
  const fmt = useFormatteurs();
  const tPeriodes = useTranslations('property.rentPeriodsShort');
  const vignette = property.photos[0]?.thumbnail ?? null;
  const lieu = property.location.quarter ?? property.location.city;
  const periode = property.contract_type === 'rent' ? tPeriodes(property.rent_period ?? 'monthly') : null;
  const prix = `${fmt.montant(property.price, property.currency)}${periode ? ` / ${periode}` : ''}`;

  return (
    <div className={cn('flex items-center gap-3 bg-background', className)}>
      <div
        className={cn(
          'relative flex-none overflow-hidden rounded-xl bg-muted text-muted-foreground',
          compact ? 'size-12' : 'size-14',
        )}
      >
        {vignette ? (
          <Image src={vignette} alt="" fill sizes={compact ? '48px' : '56px'} className="object-cover" />
        ) : (
          <ImageOff className="absolute inset-0 m-auto size-5" aria-hidden />
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[15px] font-medium text-foreground">{property.title}</p>
        <p className="truncate text-sm tabular-nums text-muted-foreground">
          {lieu ? `${lieu} · ${prix}` : prix}
        </p>
      </div>
    </div>
  );
}
