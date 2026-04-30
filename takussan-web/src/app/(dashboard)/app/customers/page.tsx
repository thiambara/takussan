import Link from 'next/link';
import { forbidden } from 'next/navigation';
import { UserPlus } from 'lucide-react';

import { getMeAction } from '@/app/actions/auth';
import { getToken } from '@/lib/session';
import {
  fetchCrmTags,
  fetchDashboardCustomers,
} from '@/lib/queries/customers';
import { isAdmin, isAgent, isOwner } from '@/lib/roles';
import { CustomerList } from '@/components/customer-dashboard/CustomerList';
import { CustomerListFilters } from '@/components/customer-dashboard/CustomerListFilters';
import { PropertyPagination } from '@/components/property-dashboard/PropertyPagination';

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
  const user = await getMeAction();
  if (!(isAgent(user.roles) || isAdmin(user.roles) || isOwner(user.roles))) {
    forbidden();
  }

  const params = await searchParams;
  const token = await getToken();
  if (!token) forbidden();

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
          <h1 className="text-2xl font-bold text-app-ink">Clients (CRM)</h1>
          <p className="mt-1 text-sm text-app-ink-muted">
            Suivez vos contacts, leurs étapes de pipeline et les interactions
            associées.
          </p>
        </div>
        <Link
          href="/app/customers/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <UserPlus className="size-4" aria-hidden="true" />
          Ajouter un client
        </Link>
      </header>

      <CustomerListFilters crmTags={crmTags} />

      <CustomerList page={response} />

      <PropertyPagination meta={response.meta} />
    </div>
  );
}
