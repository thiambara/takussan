'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';

import { usePlatformAbilities } from '@/components/admin/super/PlatformAbilitiesProvider';
import { PageHeader } from '@/components/console';
import { ErrorState } from '@/components/feedback';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClassementAnnonceurs } from './ClassementAnnonceurs';
import { MarcheRadar } from './MarcheRadar';

const ONGLETS = ['advertisers', 'market'] as const;
type Onglet = (typeof ONGLETS)[number];
const estOnglet = (v: unknown): v is Onglet => (ONGLETS as readonly unknown[]).includes(v);

/**
 * TCK-2393 (ADR-0083) — l'observatoire du Radar : le classement des annonceurs (l'outil commercial) et le marché (les
 * agrégats anonymes). Geste `platform.radar.operate` ; sans lui, un seul refus et aucun appel. Seul l'onglet actif est monté :
 * celui qu'on ne regarde pas ne fait aucune requête.
 */
export function RadarObservatoire() {
  const t = useTranslations('superAdmin.pages.radar.observatory');
  const { can } = usePlatformAbilities();
  const [onglet, setOnglet] = useState<Onglet>('advertisers');

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
      <Link
        href="/super-admin/radar"
        className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('back')}
      </Link>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <Tabs value={onglet} onValueChange={(v) => { if (estOnglet(v)) setOnglet(v); }}>
        <TabsList aria-label={t('tabsAria')}>
          {ONGLETS.map((o) => <TabsTrigger key={o} value={o}>{t(`tabs.${o}`)}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="advertisers" className="pt-2">
          {onglet === 'advertisers' ? <ClassementAnnonceurs /> : null}
        </TabsContent>
        <TabsContent value="market" className="pt-2">
          {onglet === 'market' ? <MarcheRadar /> : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
