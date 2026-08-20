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
      <TabsList>
        <TabsTrigger value="overview">{tTabs('overview')}</TabsTrigger>
        <TabsTrigger value="notes">{tTabs('notes', { count: notes.length })}</TabsTrigger>
        <TabsTrigger value="documents">{tTabs('documents', { count: documents.length })}</TabsTrigger>
        <TabsTrigger value="relationships">{tTabs('relationships', { count: relationships.length })}</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="rounded-xl bg-app-surface-1 p-6">
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
                className="rounded-xl bg-app-surface-1 p-4 text-sm"
              >
                <p className="font-semibold text-app-ink">
                  {rel.relationship_type.replace('_', ' / ')}
                </p>
                <p className="text-xs text-app-ink-muted">
                  {t('since', { date: formatDateTime(rel.start_date, locale) })}
                  {rel.end_date ? t('until', { date: formatDateTime(rel.end_date, locale) }) : ''}
                  {rel.is_primary ? t('primaryContact') : ''}
                  {t('statusSuffix', { status: rel.status })}
                </p>
                {rel.notes ? (
                  <p className="mt-2 whitespace-pre-line text-app-ink">{rel.notes}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </TabsContent>
    </Tabs>
  );
}
