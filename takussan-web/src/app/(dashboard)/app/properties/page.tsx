import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';

import { getMeAction } from '@/app/actions/auth';
import { getToken } from '@/lib/session';
import { fetchDashboardProperties } from '@/lib/queries/properties-server';
import { assertCanReachAgentArea } from '@/lib/auth/guards';
import { PropertyList } from '@/components/property-dashboard/PropertyList';
import { PropertyListFilters } from '@/components/property-dashboard/PropertyListFilters';
import { PropertyPagination } from '@/components/property-dashboard/PropertyPagination';
import { PropertyKpiStrip } from '@/components/property-dashboard/PropertyKpiStrip';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.properties');
  return { title: t('metaTitle') };
}

/**
 * TCK-041 — dashboard agent, liste des biens.
 *
 * Auth gate : enforced by the `(dashboard)` layout (redirects to
 * `/auth/login`). Role gate : agents / agency_admin / super_admin / owner.
 * Scoping by agency is handled server-side by the `PropertyPolicy` +
 * controller query in takussan-api.
 */

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function asString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

const ALLOWED_PER_PAGE = [10, 20, 50] as const;
type AllowedPerPage = (typeof ALLOWED_PER_PAGE)[number];

function parsePerPage(value: string | undefined): AllowedPerPage {
  const parsed = Number.parseInt(value ?? '20', 10);
  return (ALLOWED_PER_PAGE as readonly number[]).includes(parsed)
    ? (parsed as AllowedPerPage)
    : 20;
}

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const t = await getTranslations('dashboard.properties');
  const user = await getMeAction();
  assertCanReachAgentArea(user.roles);

  const params = await searchParams;
  const token = await getToken();
  // `getMeAction` already redirects on missing token, so this is defensive.
  if (!token) redirect('/app');

  const page = Number.parseInt(asString(params.page) ?? '1', 10) || 1;
  const perPage = parsePerPage(asString(params.per_page));
  const filters = {
    status: asString(params.status),
    type: asString(params.type),
    contract_type: asString(params.contract_type),
    visibility: asString(params.visibility),
    search: asString(params.search),
    city: asString(params.city),
    user_id: asString(params.only_mine) === '1' ? String(user.id) : asString(params.user_id),
    price_min: asString(params.price_min),
    price_max: asString(params.price_max),
    created_from: asString(params.created_from),
    created_to: asString(params.created_to),
    include_archived: asString(params.include_archived),
  };
  const sort = asString(params.sort);

  const safeSort =
    sort && ['-created_at', 'created_at', 'price', '-price', 'views_count', '-views_count'].includes(sort)
      ? sort
      : '-created_at';

  // Main list + KPI counts run in parallel. KPI requests use per_page=1 to
  // only pull `meta.total` — keeps the dashboard snappy.
  const [response, totalCount, publishedCount, soldRentedCount, archivedCount] =
    await Promise.all([
      fetchDashboardProperties(token, {
        page,
        perPage,
        filters,
        sort: safeSort,
      }),
      countProperties(token, { user_id: filters.user_id }),
      countProperties(token, {
        user_id: filters.user_id,
        filter: { visibility: 'public' },
      }),
      countProperties(token, {
        user_id: filters.user_id,
        filter: { status: 'sold' },
      }).then(async (sold) => {
        const rented = await countProperties(token, {
          user_id: filters.user_id,
          filter: { status: 'rented' },
        });
        return sold + rented;
      }),
      countProperties(token, {
        user_id: filters.user_id,
        filter: { status: 'archived' },
        include_archived: true,
      }),
    ]);

  const agentOptions = buildAgentOptions(response.data, user);
  const currentVisibility = asString(params.visibility);
  const currentStatus = filters.status;
  const includeArchived = filters.include_archived === '1';

  const kpiTiles = [
    {
      label: 'Total',
      value: totalCount,
      href: '/app/properties',
      tone: 'neutral' as const,
      active:
        !currentStatus &&
        !currentVisibility &&
        !includeArchived &&
        Object.values(filters).filter(Boolean).length === 0,
    },
    {
      label: t('published'),
      value: publishedCount,
      href: '/app/properties?visibility=public',
      tone: 'accent' as const,
      active: currentVisibility === 'public',
    },
    {
      label: t('soldRented'),
      value: soldRentedCount,
      href: '/app/properties?status=sold',
      tone: 'success' as const,
      active: currentStatus === 'sold' || currentStatus === 'rented',
    },
    {
      label: t('archived'),
      value: archivedCount,
      href: '/app/properties?include_archived=1&status=archived',
      tone: 'muted' as const,
      active: currentStatus === 'archived',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <Link
            href="/app/properties/new"
            className={buttonVariants({ size: 'lg' })}
          >
            <Plus className="size-4" aria-hidden="true" />
            {t('publish')}
          </Link>
        }
      />

      <PropertyKpiStrip tiles={kpiTiles} />

      <PropertyListFilters currentUserId={user.id} agentOptions={agentOptions} />

      <PropertyList
        page={response}
        currentUserId={user.id}
        agentOptions={agentOptions}
      />

      <PropertyPagination meta={response.meta} />
    </div>
  );
}

async function countProperties(
  token: string,
  opts: {
    readonly user_id?: string;
    readonly filter?: Record<string, string>;
    readonly include_archived?: boolean;
  } = {},
): Promise<number> {
  const filter: Record<string, string> = { ...(opts.filter ?? {}) };
  if (opts.user_id) filter.user_id = opts.user_id;
  const response = await fetchDashboardProperties(token, {
    page: 1,
    perPage: 1,
    filters: {
      ...filter,
      include_archived: opts.include_archived ? '1' : undefined,
    },
  });
  return response.meta.total;
}

function buildAgentOptions(
  properties: Awaited<ReturnType<typeof fetchDashboardProperties>>['data'],
  user: Awaited<ReturnType<typeof getMeAction>>,
) {
  const map = new Map<number, string>();
  map.set(user.id, user.full_name || `${user.first_name} ${user.last_name}`.trim());
  for (const property of properties) {
    if (property.owner) {
      map.set(property.owner.id, property.owner.name);
    }
    for (const collaborator of property.collaborators ?? []) {
      if (collaborator.user) {
        map.set(collaborator.user.id, collaborator.user.name);
      }
    }
  }

  return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
}
