'use client';
import { Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FavoriteButton } from '@/components/favorites/FavoriteButton';
import { ZONE_TACTILE_44 } from '@/lib/zone-tactile';

interface GestesSurPhotoProps {
  readonly propertyId: number;
  /** Le prix affiché : la référence du suivi de prix d'un favori anonyme (TCK-2508). */
  readonly prix: number | null;
  /** Le partage de la fiche (`PropertyShareDialog`), le même que celui de `PropertyHeader`. */
  readonly onShare: () => void;
}

/**
 * TCK-2503 — au téléphone, « partager » et « favori » se posent sur la photo qui ouvre la fiche,
 * à droite du retour (maquette de la fiche, approche A ; relevé `docs/qa/audit-ux-2026-11/entetes-mobiles.md`).
 *
 * Seulement sous `md` : à partir de là, la photo n'ouvre plus la page et `PropertyHeader` garde les
 * deux gestes sous le titre — le bureau ne change pas. Le favori est le `FavoriteButton` partagé, en
 * pastille pleine comme le retour (`surPhoto`) ; le partage ouvre la boîte de la fiche.
 */
export function GestesSurPhoto({ propertyId, prix, onShare }: GestesSurPhotoProps) {
  const t = useTranslations('propertyDetail');
  return (
    <div data-slot="gestes-sur-photo" className="flex items-center gap-2 md:hidden">
      <button
        type="button"
        onClick={onShare}
        aria-label={t('shareAria')}
        className={`inline-flex size-10 ${ZONE_TACTILE_44} items-center justify-center rounded-full bg-card text-foreground shadow-[0_2px_8px_-2px_color-mix(in_oklab,var(--shadow-color)_35%,transparent)] transition-[scale] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      >
        <Share2 className="size-[18px]" aria-hidden />
      </button>
      <FavoriteButton propertyId={propertyId} prix={prix} surPhoto />
    </div>
  );
}
