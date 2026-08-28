import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';


import { fetchTagsAction } from '@/app/actions/admin-tags';
import { getToken } from '@/lib/session';
import { fetchDashboardProperty } from '@/lib/queries/properties-server';
import { ApiError } from '@/lib/api';
import { PropertyDetailTabs } from '@/components/property-dashboard/PropertyDetailTabs';
import { PropertyHeaderActions } from '@/components/property-dashboard/PropertyHeaderActions';
import { PropertyStatusBadge } from '@/components/property-dashboard/PropertyStatusBadge';
import { PropertyVisibilityBadge } from '@/components/property-dashboard/PropertyVisibilityBadge';
import { PropertyModerationBanner } from '@/components/property-form/PropertyModerationBanner';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.propertyDetail');
  return { title: t('metaTitle') };
}

/**
 * TCK-041 — page d'édition d'un bien existant.
 */

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export default async function Page({ params }: { params: Params }) {
  const t = await getTranslations('dashboard.pages.propertyDetail');
  // TCK-426 — la garde de rôle est REMONTÉE dans le `layout.tsx` de ce segment : ici, sous le
  // `loading.tsx`, son `redirect()` rendait 200 + le squelette de la route interdite.

  const { id } = await params;
  const token = await getToken();
  // TCK-426 — NARROWING DE TYPE, PAS UNE DÉCISION. Le `layout.tsx` de ce segment a déjà refusé
  // l'absence de jeton, au-dessus de la frontière de suspension ; et `getMeAction()` redirige
  // vers `/auth/login` bien avant, depuis `(dashboard)/layout.tsx`. Cette branche est donc
  // inatteignable — mais `getToken()` rend `string | null` et le typage exige qu'on le dise.
  // *Ce qu'elle ne fait SURTOUT pas, c'est rediriger : sous un `loading.tsx`, un `redirect()` de
  // page rend 200 + le squelette au lieu du 307.*
  if (!token) return null;

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
