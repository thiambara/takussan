'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Activity, Layers3, Repeat, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CohortHeatmap } from './CohortHeatmap';
import { FunnelChart } from './FunnelChart';
import { GrowthChart } from './GrowthChart';
import { RevenueChart } from './RevenueChart';

type Tab = 'growth' | 'revenue' | 'cohorts' | 'funnel';

/** La donnée porte la CLÉ, le rendu la résout (patron TCK-286). */
const TABS: { id: Tab; icon: typeof TrendingUp }[] = [
  { id: 'growth', icon: TrendingUp },
  { id: 'revenue', icon: Activity },
  { id: 'cohorts', icon: Layers3 },
  { id: 'funnel', icon: Repeat },
];

/**
 * Chaque panneau ne rend son graphique QUE lorsqu'il est actif.
 *
 * `<TabsContent>` monte ses enfants même caché, et les quatre graphiques déclenchent chacun leur
 * requête au montage : rendre les quatre en même temps ferait quatre appels réseau là où l'ancien
 * rendu conditionnel en faisait un. Le montage conditionnel préserve donc le comportement mesuré.
 */
const PANELS: Record<Tab, () => React.JSX.Element> = {
  growth: GrowthChart,
  revenue: RevenueChart,
  cohorts: CohortHeatmap,
  funnel: FunnelChart,
};

function isTab(value: string | undefined): value is Tab {
  return TABS.some((entry) => entry.id === value);
}

/**
 * TCK-595 — `initialTab` vient de `?tab=` (lu par la page serveur) : la tuile MRR de l'accueil
 * super-admin mène à l'onglet des revenus, pas à la croissance. Une valeur inconnue est ignorée.
 *
 * P168.05 — le changement d'onglet s'écrit dans `?tab=` par `router.replace` (patron
 * d'`AdminFinancesTabs`), le défaut `growth` hors de l'URL : un rechargement rend l'onglet choisi.
 */
export function ReportingShell({ initialTab }: { readonly initialTab?: string } = {}) {
  const t = useTranslations('reporting.tabs');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTabState] = useState<Tab>(isTab(initialTab) ? initialTab : 'growth');

  const setTab = (next: Tab) => {
    setTabState(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'growth') {
      params.delete('tab');
    } else {
      params.set('tab', next);
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '?');
  };

  return (
    <Tabs value={tab} onValueChange={(value) => {
      if (isTab(value as string)) setTab(value as Tab);
    }} className="gap-4">
      <TabsList variant="line" className="grid w-full grid-cols-2 gap-y-2 group-data-horizontal/tabs:h-auto sm:inline-flex sm:w-fit">
        {TABS.map((entry) => {
          const Icon = entry.icon;
          return (
            <TabsTrigger key={entry.id} value={entry.id}>
              <Icon className="size-4" aria-hidden="true" />
              {t(entry.id)}
            </TabsTrigger>
          );
        })}
      </TabsList>

      {TABS.map((entry) => {
        const Panel = PANELS[entry.id];
        return (
          <TabsContent key={entry.id} value={entry.id}>
            {tab === entry.id ? <Panel /> : null}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
