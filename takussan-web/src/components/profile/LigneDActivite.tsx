'use client';

import { useTranslations } from 'next-intl';
import { activiteDeLEspace, segmentsDActivite, type ProfilAvecActivite } from '@/lib/activite-des-espaces';
import { cn } from '@/lib/utils';
import type { Profile } from '@/types/profile';

/**
 * TCK-2848 — sous chaque espace de « Vos espaces » (menu du compte, feuille du compte, choix d'espace),
 * ce qui l'attend aujourd'hui : « 4 demandes · 2 visites aujourd'hui », « 2 biens · 1 loyer en retard ».
 * Les seuls compteurs non nuls ; aucun, ou la lecture en cours ou en échec : RIEN — ni « 0 demande », ni
 * squelette qui décalerait les cartes.
 */
export function LigneDActivite({
  espace,
  activites,
  className,
}: {
  readonly espace: Profile;
  readonly activites: readonly ProfilAvecActivite[] | undefined;
  readonly className?: string;
}) {
  const t = useTranslations('profile.activite');
  const segments = segmentsDActivite(activiteDeLEspace(espace, activites));
  if (segments.length === 0) return null;
  return (
    <span data-slot="ligne-d-activite" className={cn('block truncate', className)}>
      {segments.map((s) => t(s.cle, { count: s.nombre })).join(' · ')}
    </span>
  );
}
