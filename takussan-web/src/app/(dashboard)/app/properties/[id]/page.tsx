import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.propertyDetail');
  return { title: t('metaTitle') };
}
import { fetchTagsAction } from '@/app/actions/admin-tags';
import { getToken } from '@/lib/session';
import { fetchDashboardProperty } from '@/lib/queries/properties-server';
import { ApiError } from '@/lib/api';
import { assertCanReachAgentArea } from '@/lib/auth/guards';
import { PropertyDetailTabs } from '@/components/property-dashboard/PropertyDetailTabs';
import { PropertyHeaderActions } from '@/components/property-dashboard/PropertyHeaderActions';
import { PropertyStatusBadge } from '@/components/property-dashboard/PropertyStatusBadge';
import { PropertyVisibilityBadge } from '@/components/property-dashboard/PropertyVisibilityBadge';
import { PropertyModerationBanner } from '@/components/property-form/PropertyModerationBanner';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

/**
 * TCK-041 — page d'édition d'un bien existant.
 */

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export default async function Page({ params }: { params: Params }) {
  const t = await getTranslations('dashboard.pages.propertyDetail');
  const user = await getMeAction();
  assertCanReachAgentArea(user.roles);

  const { id } = await params;
  const token = await getToken();
  if (!token) redirect('/app');

  let property;
  try {
    property = await fetchDashboardProperty(token, id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      redirect('/app');
    }
    throw e;
  }

  const tagsResult = await fetchTagsAction({ filters: { type: 'amenity' }, perPage: 200 });
  const tags = tagsResult.ok ? (tagsResult.data?.data ?? []) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('eyebrow', { reference: property.reference_number ?? `#${property.id}` })}
        title={property.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <PropertyStatusBadge
              status={property.status}
              statusLabel={property.status_label}
            />
            <PropertyVisibilityBadge visibility={property.visibility} />
            <span className="text-xs text-muted-foreground">
              {property.type_label}
              {property.contract_type_label
                ? ` · ${property.contract_type_label}`
                : ''}
              {property.location?.city ? ` · ${property.location.city}` : ''}
            </span>
          </span>
        }
        actions={<PropertyHeaderActions property={property} />}
      />

      <PropertyModerationBanner property={property} />

      <PropertyDetailTabs property={property} tags={tags} />
    </div>
  );
}
