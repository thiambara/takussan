'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';

import { usePlatformAbilities } from '@/components/admin/super/PlatformAbilitiesProvider';
import { PageHeader } from '@/components/console';
import { ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { RadarIntakeSheet } from './RadarIntakeSheet';
import { RadarNav } from './RadarNav';
import { RadarWorkList } from './RadarWorkList';

/**
 * TCK-2386 (ADR-0077) — l'écran du Radar : la liste de travail, et la saisie rapide ouverte depuis
 * l'en-tête. Geste `platform.radar.operate` (support et au-dessus) : l'entrée de menu ne s'affiche
 * qu'avec lui, et l'API rend 403 à tout autre opérateur.
 */
export function RadarConsole() {
  const t = useTranslations('superAdmin.pages.radar');
  const { can } = usePlatformAbilities();
  const [saisie, setSaisie] = useState(false);

  // Un viewer qui tape l'URL : un seul refus, aucun appel (l'API rendrait deux 403).
  if (!can('platform.radar.operate')) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('title')} description={t('subtitle')} />
        <ErrorState message={t('forbidden')} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <RadarNav />
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={(
          <Button type="button" onClick={() => setSaisie(true)}>
            <Plus className="size-4" aria-hidden="true" />
            {t('openIntake')}
          </Button>
        )}
      />
      <RadarWorkList />
      <RadarIntakeSheet open={saisie} onOpenChange={setSaisie} />
    </div>
  );
}
