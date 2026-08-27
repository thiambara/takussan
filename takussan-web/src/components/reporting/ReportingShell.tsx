'use client';

import { useState } from 'react';
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

export function ReportingShell() {
  const t = useTranslations('reporting.tabs');
  const [tab, setTab] = useState<Tab>('growth');

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="gap-4">
      <TabsList variant="line" className="h-auto flex-wrap">
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
