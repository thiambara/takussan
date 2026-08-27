import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { redirect } from 'next/navigation';
import { UserPlus } from 'lucide-react';

import { getMeAction } from '@/app/actions/auth';
import { getToken } from '@/lib/session';
import {
  fetchCrmTags,
  fetchDashboardCustomers,
} from '@/lib/queries/customers';
import { assertCanReachAgentArea } from '@/lib/auth/guards';
import { CustomerList } from '@/components/customer-dashboard/CustomerList';
import { CustomerListFilters } from '@/components/customer-dashboard/CustomerListFilters';
import { PropertyPagination } from '@/components/property-dashboard/PropertyPagination';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.customers');
  return { title: t('metaTitle') };
}

/**
 * TCK-042 — dashboard agent CRM, liste des clients.
 * TCK-093 — tags filter support.
 */

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function asString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const t = await getTranslations('dashboard.pages.customers');
  const user = await getMeAction();
  assertCanReachAgentArea(user.roles);

  const params = await searchParams;
  const token = await getToken();
  if (!token) redirect('/app');

  const page = Number.parseInt(asString(params.page) ?? '1', 10) || 1;
  const filters = {
    status: asString(params.status),
    pipeline_stage: asString(params.pipeline_stage),
    search: asString(params.search),
    tags: asString(params.tags),
  };

  const [response, crmTags] = await Promise.all([
    fetchDashboardCustomers(token, { page, perPage: 20, filters }),
    fetchCrmTags(token).catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Link
          href="/app/customers/new"
          className={buttonVariants({ size: 'lg' })}
        >
          <UserPlus className="size-4" aria-hidden="true" />
          {t('add')}
        </Link>
      </header>

      <CustomerListFilters crmTags={crmTags} />

      <CustomerList page={response} />

      <PropertyPagination meta={response.meta} />
    </div>
  );
}
