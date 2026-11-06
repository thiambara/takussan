'use client';

import { Home } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { LigneDeStatut } from './LigneDeStatut';

interface CarteDeMiseEnLocationProps {
  readonly href: string;
  readonly onNavigate?: () => void;
  readonly infobulle?: boolean;
}

/**
 * TCK-2478 (ADR-0089) — « Mettre un bien en location », vers `/publish` (TCK-625), pour le client et le
 * locataire : elle remplace la ligne « Publier un bien » de leur menu. Aucune règle d'accès : c'est
 * `composerMenu` qui la rend ou non (`menu.carte`).
 *
 * TCK-2490 (ADR-0090 §6) — une ligne de statut et non plus une carte : même lien, même sens.
 */
export function CarteDeMiseEnLocation({ href, onNavigate, infobulle }: CarteDeMiseEnLocationProps) {
  const t = useTranslations('nav.sidebar');
  return (
    <LigneDeStatut
      href={href}
      slot="carte-location"
      icone={Home}
      tonIcone="text-primary"
      titre={t('carteLocation.titre')}
      texte={t('statut.miseEnLocation')}
      infobulle={infobulle}
      onNavigate={onNavigate}
    />
  );
}
