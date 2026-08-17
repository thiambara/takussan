import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';

import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.customerDetail');
  return { title: t('metaTitle') };
}
import { getToken } from '@/lib/session';
import { ApiError } from '@/lib/api';
import {
  fetchCrmTags,
  fetchCustomerNotes,
  fetchCustomerRelationships,
  fetchDashboardCustomer,
} from '@/lib/queries/customers';
import { assertCanReachAgentArea } from '@/lib/auth/guards';
import { EmptyState } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
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

  const t = await getTranslations('crm.customerDetail');
  const tPage = await getTranslations('dashboard.pages.customerDetail');

  const customerId = Number.parseInt(id, 10);
  if (!Number.isFinite(customerId)) {
    return (
      <CustomerDetailUnavailable
        title={t('not_found_title')}
        message={t('invalid_id_message')}
        backLabel={t('back_cta')}
      />
    );
  }

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
    if (e instanceof ApiError && e.status === 404) {
      return (
        <CustomerDetailUnavailable
          title={t('not_found_title')}
          message={t('not_found_message')}
          backLabel={t('back_cta')}
        />
      );
    }
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      return (
        <CustomerDetailUnavailable
          title={t('forbidden_title')}
          message={t('forbidden_message')}
          backLabel={t('back_cta')}
        />
      );
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
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {tPage('eyebrow', { id: customer.id })}
          </p>
          <h1 className="font-display text-2xl font-bold text-foreground">
            {customer.first_name} {customer.last_name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
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

/**
 * `CustomerDetailError` était son nom, et il décrivait mal ce qu'il fait : les trois cas qu'il
 * rend — identifiant invalide, 404, 403 — ne sont pas des erreurs à réessayer mais une fiche
 * qu'on ne peut pas ouvrir. C'est un état vide, pas un bloc d'erreur : d'où `EmptyState` et non
 * `ErrorState`, et d'où le nom (TCK-291).
 */
function CustomerDetailUnavailable({
  title,
  message,
  backLabel,
}: {
  readonly title: string;
  readonly message: string;
  readonly backLabel: string;
}) {
  return (
    <EmptyState
      icon={<AlertTriangle className="size-8" aria-hidden="true" />}
      title={title}
      description={message}
      action={
        <Link href="/app/customers" className={buttonVariants()}>
          {backLabel}
        </Link>
      }
    />
  );
}
