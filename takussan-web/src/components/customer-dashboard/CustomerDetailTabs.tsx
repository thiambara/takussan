'use client';

import { Users } from 'lucide-react';

import { EmptyState } from '@/components/feedback';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CustomerForm } from '@/components/customer-form';
import type {
  CustomerDetail,
  CustomerDocument,
  CustomerNote,
  CustomerRelationship,
} from '@/types/customer';
import { formatDateTime } from '@/lib/format';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/config';

import { CustomerNotesTimeline } from './CustomerNotesTimeline';
import { CustomerDocumentsPanel } from './CustomerDocumentsPanel';

/**
 * Tabs shell for the customer detail page — TCK-042.
 */

/**
 * TCK-586 — le type de relation s'affichait par son code (`owner_tenant` → « owner / tenant »)
 * dans toutes les langues. Une valeur que le front ne connaît pas s'affiche par un libellé
 * neutre, jamais par son code.
 */
const TYPES_DE_RELATION_CONNUS = new Set(['owner_tenant', 'agent_client']);

interface CustomerDetailTabsProps {
  readonly customer: CustomerDetail;
  readonly notes: CustomerNote[];
  readonly documents: CustomerDocument[];
  readonly relationships: CustomerRelationship[];
}

export function CustomerDetailTabs({
  customer,
  notes,
  documents,
  relationships,
}: CustomerDetailTabsProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('crm.customerDetail.relationships');
  const tTabs = useTranslations('crm.customerDetail.tabs');

  return (
    <Tabs defaultValue="overview" className="space-y-4">
      {/*
        Revue design 2026-09-16 — à 360, « Relations (1) » débordait de 21 px hors de l'écran, coupé.
        La barre défile dans son conteneur, jusqu'aux bords de l'écran sous `sm`.
      */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsList className="w-max">
          <TabsTrigger value="overview">{tTabs('overview')}</TabsTrigger>
          <TabsTrigger value="notes">{tTabs('notes', { count: notes.length })}</TabsTrigger>
          <TabsTrigger value="documents">{tTabs('documents', { count: documents.length })}</TabsTrigger>
          <TabsTrigger value="relationships">{tTabs('relationships', { count: relationships.length })}</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="overview" className="rounded-xl bg-card p-4 sm:p-6">
        <CustomerForm mode="edit" customer={customer} compact />
      </TabsContent>

      <TabsContent value="notes">
        <CustomerNotesTimeline customerId={customer.id} notes={notes} />
      </TabsContent>

      <TabsContent value="documents">
        <CustomerDocumentsPanel customerId={customer.id} documents={documents} />
      </TabsContent>

      <TabsContent value="relationships">
        {relationships.length === 0 ? (
          <EmptyState
            icon={<Users className="size-8" aria-hidden="true" />}
            title={t('empty_title')}
            description={t('empty_description')}
          />
        ) : (
          <ul className="space-y-2">
            {relationships.map((rel) => (
              <li
                key={rel.id}
                className="rounded-xl bg-card p-4 text-sm"
              >
                <p className="font-semibold text-foreground">
                  {t(`type.${TYPES_DE_RELATION_CONNUS.has(rel.relationship_type) ? rel.relationship_type : 'other'}`)}
                </p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {t('since', { date: formatDateTime(rel.start_date, locale) })}
                  {rel.end_date ? t('until', { date: formatDateTime(rel.end_date, locale) }) : ''}
                  {rel.is_primary ? t('primaryContact') : ''}
                  {t('statusSuffix', { status: rel.status })}
                </p>
                {rel.notes ? (
                  <p className="mt-2 whitespace-pre-line text-pretty text-foreground">{rel.notes}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </TabsContent>
    </Tabs>
  );
}
