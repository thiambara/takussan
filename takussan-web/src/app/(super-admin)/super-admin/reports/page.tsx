import { getTranslations } from 'next-intl/server';
import { ReportingShell } from '@/components/reporting/ReportingShell';
import { PageHeader } from '@/components/console';

type Props = {
  readonly searchParams?: Promise<{ tab?: string | string[] }>;
};

export default async function Page({ searchParams }: Props = {}) {
  const t = await getTranslations('superAdmin.pages.reports');
  const { tab } = (await searchParams) ?? {};

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
      />
      <ReportingShell initialTab={typeof tab === 'string' ? tab : undefined} />
    </div>
  );
}
