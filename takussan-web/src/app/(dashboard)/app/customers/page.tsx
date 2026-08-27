import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { redirect } from 'next/navigation';
import { KanbanSquare, UserPlus } from 'lucide-react';

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
import { PageHeader } from '@/components/console';

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
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={(
          <>
            {/*
              TCK-379 — `/app/crm/pipeline` n'avait AUCUN lien entrant : le kanban existait, avec
              ses tests, et n'était atteignable que par saisie d'URL. Il est desservi depuis ICI
              parce que le pipeline est une VUE du CRM, pas une section parallèle.

              Aucune condition de rôle n'est ajoutée, et ce n'est pas un oubli : cette page
              appelle `assertCanReachAgentArea` plus haut, dont l'ensemble autorisé
              (agent | owner | admin) est EXACTEMENT l'allowlist du garde serveur de
              `crm/pipeline/page.tsx`. Quiconque lit ce lien peut déjà ouvrir sa cible ; le lien
              n'autorise rien de plus, et la page cible garde son propre refus serveur —
              `assertCanReachAgentArea`, et non un `forbidden()` : TCK-378 a retiré l'appel de
              cette page-là précisément, parce que sans `experimental.authInterrupts` il rendait
              un écran de panne au lieu d'un refus.
            */}
            <Link
              href="/app/crm/pipeline"
              className={buttonVariants({ variant: 'outline', size: 'lg' })}
            >
              <KanbanSquare className="size-4" aria-hidden="true" />
              {t('pipelineView')}
            </Link>
            <Link href="/app/customers/new" className={buttonVariants({ size: 'lg' })}>
              <UserPlus className="size-4" aria-hidden="true" />
              {t('add')}
            </Link>
          </>
        )}
      />

      <CustomerListFilters crmTags={crmTags} />

      <CustomerList page={response} />

      <PropertyPagination meta={response.meta} />
    </div>
  );
}
