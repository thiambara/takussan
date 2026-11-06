'use client';

import { Hourglass, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { LigneDeStatut } from './LigneDeStatut';

interface ProUpgradeCardProps {
  readonly pending?: boolean;
  readonly onNavigate?: () => void;
  readonly infobulle?: boolean;
}

const UPGRADE_HREF = '/app/settings/agency/upgrade';

/**
 * TCK-267 — « Passer en agence », au pied de la barre de `/app`, pour l'admin d'une agence
 * `individual` ; « Demande en cours » quand une demande attend la plateforme.
 *
 * TCK-2490 (ADR-0090 §6) — une ligne de statut et non plus une carte : même lien, même sens. En
 * attente, le sablier en `text-warning` (« quelque chose est en cours », pas une alerte).
 */
export function ProUpgradeCard({ pending = false, onNavigate, infobulle }: ProUpgradeCardProps) {
  const t = useTranslations('nav.proUpgrade');
  const tStatut = useTranslations('nav.sidebar.statut');
  return (
    <LigneDeStatut
      href={UPGRADE_HREF}
      slot="statut-agence"
      icone={pending ? Hourglass : Sparkles}
      tonIcone={pending ? 'text-warning' : 'text-primary'}
      titre={pending ? t('pendingTitle') : t('title')}
      texte={pending ? tStatut('demandeEnCours') : tStatut('passerEnAgence')}
      infobulle={infobulle}
      onNavigate={onNavigate}
    />
  );
}
