'use client';

import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/console';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AiDashboardPanel } from '@/components/admin/super/ai/AiDashboardPanel';
import { AiProvidersPanel } from '@/components/admin/super/ai/AiProvidersPanel';
import { AiRolesPanel } from '@/components/admin/super/ai/AiRolesPanel';
import { AiUsagesPanel } from '@/components/admin/super/ai/AiUsagesPanel';

/** TCK-2385 (ADR-0076 §12) — la salle des machines du socle IA : rôles, usages, fournisseurs, coûts. */
export default function SuperAdminAiPage() {
  const t = useTranslations('superAdmin.pages.ai');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <Tabs defaultValue="roles">
        <TabsList>
          <TabsTrigger value="roles">{t('tabs.roles')}</TabsTrigger>
          <TabsTrigger value="usages">{t('tabs.usages')}</TabsTrigger>
          <TabsTrigger value="providers">{t('tabs.providers')}</TabsTrigger>
          <TabsTrigger value="dashboard">{t('tabs.dashboard')}</TabsTrigger>
        </TabsList>
        <TabsContent value="roles" className="pt-4"><AiRolesPanel /></TabsContent>
        <TabsContent value="usages" className="pt-4"><AiUsagesPanel /></TabsContent>
        <TabsContent value="providers" className="pt-4"><AiProvidersPanel /></TabsContent>
        <TabsContent value="dashboard" className="pt-4"><AiDashboardPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
