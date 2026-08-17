import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';
import { MaintenanceNewLauncher } from '@/components/maintenance';
import { getTranslations } from 'next-intl/server';

interface PageProps {
  readonly searchParams: Promise<{ property?: string; lease?: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.maintenanceNew');
  return { title: t('metaTitle') };
}

/**
 * TCK-174 — la page rend toujours le launcher, qui charge les baux du
 * customer connecté, expose un selector `Bien concerné` et instancie le
 * formulaire de signalement une fois le bien choisi. Les params
 * `?property=` / `?lease=` continuent de fonctionner mais sont validés
 * contre la liste des baux du user (les ids étrangers sont ignorés).
 */
export default async function Page({ searchParams }: PageProps) {
  const t = await getTranslations('dashboard.pages.maintenanceNew');
  await getMeAction();
  const { property, lease } = await searchParams;

  const propertyId = property ? Number(property) : NaN;
  const leaseId = lease ? Number(lease) : NaN;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <MaintenanceNewLauncher
        initialPropertyId={Number.isInteger(propertyId) && propertyId > 0 ? propertyId : null}
        initialLeaseId={Number.isInteger(leaseId) && leaseId > 0 ? leaseId : null}
      />
    </div>
  );
}
