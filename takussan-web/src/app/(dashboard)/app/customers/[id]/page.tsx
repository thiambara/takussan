import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

import { getTranslations } from 'next-intl/server';


import { getToken } from '@/lib/session';
import { ApiError } from '@/lib/api';
import {
  fetchCrmTags,
  fetchCustomerNotes,
  fetchCustomerRelationships,
  fetchDashboardCustomer,
} from '@/lib/queries/customers';
import { EmptyState } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { CustomerDetailTabs } from '@/components/customer-dashboard/CustomerDetailTabs';
import { CustomerTagPickerSection } from '@/components/customer-dashboard/CustomerTagPickerSection';
import { AddDocumentButton } from '@/components/documents/AddDocumentButton';
import {
  CUSTOMER_ENUM_NAMESPACES,
  enumLabel,
} from '@/components/customer-form/options';
import {
  customerStatusValues,
  pipelineStageValues,
} from '@/lib/schemas/customer';
import type { CustomerDocument } from '@/types/customer';
import { PageHeader } from '@/components/console';

/**
 * TCK-042 — fiche client avec onglets (aperçu / notes / documents /
 * relations).
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.customerDetail');
  return { title: t('metaTitle') };
}

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

interface CustomerWithIncludes {
  documents?: CustomerDocument[];
}

export default async function Page({ params }: { params: Params }) {
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

  const t = await getTranslations('crm.customerDetail');
  const tPage = await getTranslations('dashboard.pages.customerDetail');
  const tStatus = await getTranslations(CUSTOMER_ENUM_NAMESPACES.status);
  const tStage = await getTranslations(CUSTOMER_ENUM_NAMESPACES.pipelineStage);

  const customerId = Number.parseInt(id, 10);
  // TCK-442 — la validité de l'identifiant ET l'existence de la ressource sont tranchées par
  // `[id]/layout.tsx`, strictement au-dessus du `loading.tsx` de ce segment : un `notFound()`
  // écrit ici rendrait 200, avec l'écran introuvable affiché quand même. La décision n'a pas
  // changé de nature — un identifiant illisible reste un INTROUVABLE, jamais une panne — elle
  // a changé d'étage, et elle couvre désormais aussi le 404 de l'API.

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
    ? enumLabel(tStage, pipelineStageValues, customer.pipeline_stage)
    : null;
  const statusLabel = enumLabel(tStatus, customerStatusValues, customer.status);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={tPage('eyebrow', { id: customer.id })}
        title={`${customer.first_name} ${customer.last_name}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {customer.email ? <span>{customer.email}</span> : null}
            {customer.phone ? <span>{customer.phone}</span> : null}
            {pipelineLabel ? <Badge variant="outline">{pipelineLabel}</Badge> : null}
            <Badge variant="outline">{statusLabel}</Badge>
          </span>
        }
        actions={
          <AddDocumentButton
            documentableType="customer"
            documentableId={customer.id}
            displayLabel={`${customer.first_name} ${customer.last_name}`}
          />
        }
      />

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
