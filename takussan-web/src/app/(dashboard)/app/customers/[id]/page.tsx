import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';

export const metadata: Metadata = { title: 'Fiche client' };
import { getToken } from '@/lib/session';
import { ApiError } from '@/lib/api';
import {
  fetchCrmTags,
  fetchCustomerNotes,
  fetchCustomerRelationships,
  fetchDashboardCustomer,
} from '@/lib/queries/customers';
import { assertCanReachAgentArea } from '@/lib/auth/guards';
import { Badge } from '@/components/ui/badge';
import { CustomerDetailTabs } from '@/components/customer-dashboard/CustomerDetailTabs';
import { CustomerTagPickerSection } from '@/components/customer-dashboard/CustomerTagPickerSection';
import { AddDocumentButton } from '@/components/documents/AddDocumentButton';
import {
  CUSTOMER_STATUS_LABELS,
  PIPELINE_STAGE_LABELS,
} from '@/components/customer-form/options';
import type { CustomerDocument } from '@/types/customer';

/**
 * TCK-042 — fiche client avec onglets (aperçu / notes / documents /
 * relations).
 */

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

interface CustomerWithIncludes {
  documents?: CustomerDocument[];
}

export default async function Page({ params }: { params: Params }) {
  const user = await getMeAction();
  assertCanReachAgentArea(user.roles);

  const { id } = await params;
  const token = await getToken();
  if (!token) redirect('/app');

  const customerId = Number.parseInt(id, 10);
  if (!Number.isFinite(customerId)) notFound();

  let customer;
  let notes;
  let relationships;
  let crmTagSuggestions: Awaited<ReturnType<typeof fetchCrmTags>> = [];
  try {
    [customer, notes, relationships, crmTagSuggestions] = await Promise.all([
      fetchDashboardCustomer(token, customerId),
      fetchCustomerNotes(token, customerId),
      fetchCustomerRelationships(token, customerId),
      fetchCrmTags(token).catch(() => []),
    ]);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      redirect('/app');
    }
    throw e;
  }

  const documents = (customer as CustomerWithIncludes).documents ?? [];
  const initialTags = (customer as { tags?: { id: number; name: string; slug: string; color: string | null }[] }).tags ?? [];

  const pipelineLabel = customer.pipeline_stage
    ? PIPELINE_STAGE_LABELS[customer.pipeline_stage]
    : null;
  const statusLabel = CUSTOMER_STATUS_LABELS[customer.status] ?? customer.status;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-app-ink-muted">
            Client · #{customer.id}
          </p>
          <h1 className="text-2xl font-bold text-app-ink">
            {customer.first_name} {customer.last_name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-app-ink-muted">
            {customer.email ? <span>{customer.email}</span> : null}
            {customer.phone ? <span>{customer.phone}</span> : null}
            {pipelineLabel ? <Badge variant="outline">{pipelineLabel}</Badge> : null}
            <Badge variant="outline">{statusLabel}</Badge>
          </div>
        </div>
        <AddDocumentButton
          documentableType="customer"
          documentableId={customer.id}
          displayLabel={`${customer.first_name} ${customer.last_name}`}
        />
      </header>

      <CustomerTagPickerSection
        customerId={customer.id}
        initialTags={initialTags}
        suggestions={crmTagSuggestions}
      />

      <CustomerDetailTabs
        customer={customer}
        notes={notes}
        documents={documents}
        relationships={relationships}
      />
    </div>
  );
}
