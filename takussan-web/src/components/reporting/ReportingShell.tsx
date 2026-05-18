'use client';

import { useState } from 'react';
import { Activity, Layers3, Repeat, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { CohortHeatmap } from './CohortHeatmap';
import { FunnelChart } from './FunnelChart';
import { GrowthChart } from './GrowthChart';
import { RevenueChart } from './RevenueChart';

type Tab = 'growth' | 'revenue' | 'cohorts' | 'funnel';

const TABS: { id: Tab; label: string; icon: typeof TrendingUp }[] = [
  { id: 'growth', label: 'Croissance', icon: TrendingUp },
  { id: 'revenue', label: 'Revenu', icon: Activity },
  { id: 'cohorts', label: 'Cohortes', icon: Layers3 },
  { id: 'funnel', label: 'Funnel', icon: Repeat },
];

export function ReportingShell() {
  const [tab, setTab] = useState<Tab>('growth');

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap gap-2 p-2">
          {TABS.map((entry) => {
            const Icon = entry.icon;
            const active = tab === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? 'bg-amber-500/15 text-amber-700 ring-1 ring-amber-200'
                    : 'text-muted-foreground hover:bg-muted/40'
                }`}
              >
                <Icon className="size-4" aria-hidden="true" />
                {entry.label}
              </button>
            );
          })}
        </CardContent>
      </Card>

      {tab === 'growth' ? <GrowthChart /> : null}
      {tab === 'revenue' ? <RevenueChart /> : null}
      {tab === 'cohorts' ? <CohortHeatmap /> : null}
      {tab === 'funnel' ? <FunnelChart /> : null}
    </div>
  );
}
